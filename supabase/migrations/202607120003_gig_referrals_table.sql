-- ── Referral tables & fix release_gig_escrow_with_referral ─────────────────
-- These tables were created via dashboard; adding migrations so schema is
-- tracked and portable. All statements use IF NOT EXISTS / CREATE OR REPLACE.

-- ── 1. user referrals (someone joined via referral link) ─────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  referred_id   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  referral_code TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending',  -- pending | completed
  reward_given  BOOLEAN     NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (referred_id)   -- one referral record per new user
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'referrals' AND policyname = 'Users read own referrals'
  ) THEN
    CREATE POLICY "Users read own referrals" ON public.referrals
      FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
  END IF;
END $$;

-- ── 2. gig referrals (someone applied to a gig via a shared referral link) ───
CREATE TABLE IF NOT EXISTS public.gig_referrals (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  gig_id          UUID        REFERENCES public.gigs(id) ON DELETE SET NULL,
  referrer_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  referred_id     UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  status          TEXT        NOT NULL DEFAULT 'pending',  -- pending | completed
  reward_given    BOOLEAN     NOT NULL DEFAULT false,
  gig_amount      NUMERIC,
  reward_amount   NUMERIC,
  reward_currency TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (gig_id, referred_id)  -- one referral per worker per gig
);

ALTER TABLE public.gig_referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gig_referrals' AND policyname = 'Users read own gig referrals'
  ) THEN
    CREATE POLICY "Users read own gig referrals" ON public.gig_referrals
      FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
  END IF;
END $$;

-- ── 3. Fix release_gig_escrow_with_referral ──────────────────────────────────
-- BUG: previous version deducted referrer share FROM the worker (worker got
-- 85% instead of 90%). Referrer reward should come from the platform's 10%
-- commission, not from the worker's share. Worker always gets 90%.
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
  v_worker_share NUMERIC := ROUND(p_amount * 0.90, 2);  -- worker always gets 90%
  v_worker_bal   NUMERIC;
  v_ref_bal      NUMERIC;
  v_rows         INT;
BEGIN
  -- Remove full escrow from poster's held balance
  UPDATE public.wallets
  SET held_balance = held_balance - p_amount
  WHERE user_id    = p_poster_id
    AND currency   = p_currency
    AND held_balance >= p_amount;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RAISE EXCEPTION 'release_gig_escrow_with_referral: poster wallet not found or held_balance insufficient';
  END IF;

  -- Credit referrer 5% (from platform's 10% commission share)
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
     v_ref_bal, 'completed', 'Referral reward — 5% of gig payment');

  -- Credit worker 90% (unchanged from regular release)
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
