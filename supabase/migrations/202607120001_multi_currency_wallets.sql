-- Multi-currency wallets
-- Replaces single users.wallet_balance / wallet_currency model.
-- Each (user_id, currency) pair gets its own row in the wallets table.

-- ── 1. Create wallets table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wallets (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  currency      VARCHAR(3)  NOT NULL,
  balance       NUMERIC     NOT NULL DEFAULT 0,
  held_balance  NUMERIC     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency),
  CONSTRAINT wallets_balance_non_negative      CHECK (balance      >= 0),
  CONSTRAINT wallets_held_balance_non_negative CHECK (held_balance >= 0)
);

CREATE INDEX IF NOT EXISTS wallets_user_id_idx ON public.wallets (user_id);

-- ── 2. Auto-update updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _wallets_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallets_set_updated_at ON public.wallets;
CREATE TRIGGER wallets_set_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION _wallets_set_updated_at();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
-- Users can read their own wallet rows.
-- All balance mutations go through security-definer RPCs — no client writes.
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own wallets" ON public.wallets;
CREATE POLICY "Users read own wallets"
  ON public.wallets FOR SELECT
  USING (auth.uid() = user_id);

-- ── 4. Migrate existing data from users table ────────────────────────────────
INSERT INTO public.wallets (user_id, currency, balance, held_balance)
SELECT
  id,
  COALESCE(NULLIF(TRIM(wallet_currency), ''), 'NGN'),
  GREATEST(COALESCE(wallet_balance, 0), 0),
  GREATEST(COALESCE(held_balance,   0), 0)
FROM public.users
WHERE COALESCE(wallet_balance, 0) > 0
   OR COALESCE(held_balance,   0) > 0
ON CONFLICT (user_id, currency) DO UPDATE
  SET balance      = EXCLUDED.balance,
      held_balance = EXCLUDED.held_balance,
      updated_at   = now();

-- ── 5. Helper: atomic wallet credit (used by edge functions) ────────────────
-- Creates the wallet row if it doesn't exist, then adds p_amount to balance.
-- Returns the new balance.
CREATE OR REPLACE FUNCTION _credit_wallet(
  p_user_id  UUID,
  p_currency TEXT,
  p_amount   NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_bal NUMERIC;
BEGIN
  INSERT INTO public.wallets (user_id, currency, balance, held_balance)
  VALUES (p_user_id, p_currency, p_amount, 0)
  ON CONFLICT (user_id, currency) DO UPDATE
    SET balance    = public.wallets.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING balance INTO v_bal;
  RETURN v_bal;
END;
$$;

-- Helper: atomic wallet debit (returns new balance, or NULL if insufficient)
CREATE OR REPLACE FUNCTION _debit_wallet(
  p_user_id  UUID,
  p_currency TEXT,
  p_amount   NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_bal NUMERIC;
BEGIN
  UPDATE public.wallets
  SET    balance    = balance - p_amount,
         updated_at = now()
  WHERE  user_id  = p_user_id
    AND  currency = p_currency
    AND  balance >= p_amount
  RETURNING balance INTO v_bal;
  RETURN v_bal; -- NULL means wallet not found or insufficient
END;
$$;

-- ── 6. Drop old 3-param escrow function signatures ──────────────────────────
-- New versions add p_currency (with DEFAULT) so callers without it still work.
DROP FUNCTION IF EXISTS lock_gig_escrow(uuid, uuid, numeric);
DROP FUNCTION IF EXISTS release_gig_escrow(uuid, uuid, uuid, numeric);
DROP FUNCTION IF EXISTS release_gig_escrow_with_referral(uuid, uuid, uuid, numeric, uuid, numeric);
DROP FUNCTION IF EXISTS unlock_gig_escrow(uuid, uuid, numeric);

-- ── 6. lock_gig_escrow ──────────────────────────────────────────────────────
-- Moves p_amount from poster's available balance into held_balance.
-- Returns TRUE on success, FALSE if wallet missing or balance insufficient.
CREATE OR REPLACE FUNCTION lock_gig_escrow(
  p_user_id  UUID,
  p_gig_id   UUID,
  p_amount   NUMERIC,
  p_currency TEXT DEFAULT 'NGN'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows   INT;
  v_bal    NUMERIC;
BEGIN
  UPDATE public.wallets
  SET
    balance      = balance      - p_amount,
    held_balance = held_balance + p_amount
  WHERE user_id  = p_user_id
    AND currency = p_currency
    AND balance >= p_amount;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT balance INTO v_bal
  FROM public.wallets
  WHERE user_id = p_user_id AND currency = p_currency;

  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, balance_after, status, description)
  VALUES
    (p_user_id, p_gig_id, 'escrow_lock', p_amount, p_currency,
     v_bal, 'completed', 'Funds locked in escrow for gig');

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'lock_gig_escrow error: %', SQLERRM;
  RETURN FALSE;
END;
$$;

-- ── 7. release_gig_escrow ────────────────────────────────────────────────────
-- Releases escrow on completion: removes full amount from poster held_balance,
-- credits 90% to worker. Prima's 10% is withheld.
CREATE OR REPLACE FUNCTION release_gig_escrow(
  p_gig_id    UUID,
  p_poster_id UUID,
  p_worker_id UUID,
  p_amount    NUMERIC,
  p_currency  TEXT DEFAULT 'NGN'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_worker_share NUMERIC := ROUND(p_amount * 0.90, 2);
  v_worker_bal   NUMERIC;
  v_rows         INT;
BEGIN
  -- Remove escrow from poster's held balance
  UPDATE public.wallets
  SET held_balance = held_balance - p_amount
  WHERE user_id    = p_poster_id
    AND currency   = p_currency
    AND held_balance >= p_amount;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'release_gig_escrow: poster wallet not found or held_balance insufficient';
  END IF;

  -- Credit worker 90% — create row if not yet existing
  INSERT INTO public.wallets (user_id, currency, balance, held_balance)
  VALUES (p_worker_id, p_currency, v_worker_share, 0)
  ON CONFLICT (user_id, currency) DO UPDATE
    SET balance    = public.wallets.balance + EXCLUDED.balance,
        updated_at = now();

  SELECT balance INTO v_worker_bal
  FROM public.wallets
  WHERE user_id = p_worker_id AND currency = p_currency;

  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, balance_after, status, description)
  VALUES
    (p_worker_id, p_gig_id, 'escrow_release_worker', v_worker_share, p_currency,
     v_worker_bal, 'completed', 'Payment released from escrow');
END;
$$;

-- ── 8. release_gig_escrow_with_referral ─────────────────────────────────────
-- Like release_gig_escrow but also credits the referrer their share first.
-- Worker receives: 90% of p_amount − p_referrer_share.
CREATE OR REPLACE FUNCTION release_gig_escrow_with_referral(
  p_gig_id         UUID,
  p_poster_id      UUID,
  p_worker_id      UUID,
  p_amount         NUMERIC,
  p_referrer_id    UUID,
  p_referrer_share NUMERIC,
  p_currency       TEXT DEFAULT 'NGN'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_worker_share NUMERIC := ROUND(p_amount * 0.90 - p_referrer_share, 2);
  v_worker_bal   NUMERIC;
  v_ref_bal      NUMERIC;
  v_rows         INT;
BEGIN
  -- Remove escrow from poster's held balance
  UPDATE public.wallets
  SET held_balance = held_balance - p_amount
  WHERE user_id    = p_poster_id
    AND currency   = p_currency
    AND held_balance >= p_amount;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'release_gig_escrow_with_referral: poster wallet not found or held_balance insufficient';
  END IF;

  -- Credit referrer
  INSERT INTO public.wallets (user_id, currency, balance, held_balance)
  VALUES (p_referrer_id, p_currency, p_referrer_share, 0)
  ON CONFLICT (user_id, currency) DO UPDATE
    SET balance    = public.wallets.balance + EXCLUDED.balance,
        updated_at = now();

  SELECT balance INTO v_ref_bal
  FROM public.wallets
  WHERE user_id = p_referrer_id AND currency = p_currency;

  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, balance_after, status, description)
  VALUES
    (p_referrer_id, p_gig_id, 'gig_referral_payout', p_referrer_share, p_currency,
     v_ref_bal, 'completed', 'Referral reward for gig');

  -- Credit worker (90% minus referrer share)
  INSERT INTO public.wallets (user_id, currency, balance, held_balance)
  VALUES (p_worker_id, p_currency, v_worker_share, 0)
  ON CONFLICT (user_id, currency) DO UPDATE
    SET balance    = public.wallets.balance + EXCLUDED.balance,
        updated_at = now();

  SELECT balance INTO v_worker_bal
  FROM public.wallets
  WHERE user_id = p_worker_id AND currency = p_currency;

  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, balance_after, status, description)
  VALUES
    (p_worker_id, p_gig_id, 'escrow_release_worker', v_worker_share, p_currency,
     v_worker_bal, 'completed', 'Payment released from escrow');
END;
$$;

-- ── 9. unlock_gig_escrow ─────────────────────────────────────────────────────
-- Returns locked escrow to poster (dispute resolved for poster, or cancellation).
-- No 10% fee — work was not completed.
CREATE OR REPLACE FUNCTION unlock_gig_escrow(
  p_gig_id    UUID,
  p_poster_id UUID,
  p_amount    NUMERIC,
  p_currency  TEXT DEFAULT 'NGN'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rows  INT;
  v_bal   NUMERIC;
BEGIN
  UPDATE public.wallets
  SET
    balance      = balance      + p_amount,
    held_balance = held_balance - p_amount
  WHERE user_id    = p_poster_id
    AND currency   = p_currency
    AND held_balance >= p_amount;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT balance INTO v_bal
  FROM public.wallets
  WHERE user_id = p_poster_id AND currency = p_currency;

  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, balance_after, status, description)
  VALUES
    (p_poster_id, p_gig_id, 'escrow_refund', p_amount, p_currency,
     v_bal, 'completed', 'Escrow refunded — dispute resolved in your favor');

  UPDATE public.gigs
  SET escrow_amount = 0
  WHERE id = p_gig_id;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'unlock_gig_escrow error: %', SQLERRM;
  RETURN FALSE;
END;
$$;
