-- Track receipts and wallet payouts per accepted worker/application so gigs
-- with multiple slots can complete independently and safely.

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS application_id UUID
    REFERENCES public.applications(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS application_id UUID
    REFERENCES public.applications(id) ON DELETE SET NULL;

UPDATE public.receipts r
SET application_id = a.id
FROM public.applications a
WHERE r.application_id IS NULL
  AND r.gig_id = a.gig_id
  AND r.worker_id = a.worker_id
  AND a.status IN ('accepted', 'completed');

-- Older deployments enforced one receipt per gig. Remove only unique
-- constraints/indexes whose sole key is gig_id; preserve unrelated indexes.
DO $$
DECLARE
  v_gig_att smallint;
  v_item record;
BEGIN
  SELECT attnum INTO v_gig_att
  FROM pg_attribute
  WHERE attrelid = 'public.receipts'::regclass
    AND attname = 'gig_id'
    AND NOT attisdropped;

  FOR v_item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.receipts'::regclass
      AND contype = 'u'
      AND conkey = ARRAY[v_gig_att]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.receipts DROP CONSTRAINT %I', v_item.conname);
  END LOOP;

  FOR v_item IN
    SELECT ns.nspname AS schema_name, idx.relname AS index_name
    FROM pg_index i
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    JOIN pg_class idx ON idx.oid = i.indexrelid
    WHERE i.indrelid = 'public.receipts'::regclass
      AND i.indisunique
      AND NOT i.indisprimary
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND i.indnkeyatts = 1
      AND i.indkey[0] = v_gig_att
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c WHERE c.conindid = i.indexrelid
      )
  LOOP
    EXECUTE format('DROP INDEX %I.%I', v_item.schema_name, v_item.index_name);
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_application_id_unique
  ON public.receipts(application_id)
  WHERE application_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.gig_application_payouts (
  application_id UUID PRIMARY KEY REFERENCES public.applications(id) ON DELETE RESTRICT,
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE RESTRICT,
  worker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gig_application_escrows (
  application_id UUID PRIMARY KEY REFERENCES public.applications(id) ON DELETE RESTRICT,
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE RESTRICT,
  poster_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  worker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'released', 'refunded')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.gig_application_escrows
  (application_id, gig_id, poster_id, worker_id, amount, currency, status)
SELECT a.id, g.id, g.poster_id, a.worker_id, g.pay_min,
       COALESCE(NULLIF(g.currency, ''), 'NGN'),
       CASE WHEN EXISTS (
         SELECT 1 FROM public.wallet_transactions wt
         WHERE wt.gig_id = g.id AND wt.user_id = a.worker_id
           AND wt.type = 'escrow_release_worker'
       ) THEN 'released' ELSE 'held' END
FROM public.applications a
JOIN public.gigs g ON g.id = a.gig_id
WHERE a.status IN ('accepted', 'completed')
  AND g.payment_method = 'wallet'
  AND COALESCE(g.pay_min, 0) > 0
ON CONFLICT (application_id) DO NOTHING;

-- Older accepted wallet gigs may not have a corresponding held-balance entry.
-- Reserve the shortfall before treating those application escrows as held.
DO $$
DECLARE
  v_group RECORD;
  v_wallet public.wallets%ROWTYPE;
  v_shortfall NUMERIC;
  v_balance_after NUMERIC;
  v_rows INTEGER;
BEGIN
  FOR v_group IN
    SELECT poster_id AS user_id, currency, SUM(amount) AS required_held
    FROM public.gig_application_escrows
    WHERE status = 'held'
    GROUP BY poster_id, currency
  LOOP
    SELECT * INTO v_wallet
    FROM public.wallets
    WHERE user_id = v_group.user_id AND currency = v_group.currency
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Missing wallet for existing gig escrow (% / %)',
        v_group.user_id, v_group.currency;
    END IF;

    v_shortfall := GREATEST(0, v_group.required_held - COALESCE(v_wallet.held_balance, 0));
    IF v_shortfall = 0 THEN CONTINUE; END IF;

    UPDATE public.wallets
    SET balance = balance - v_shortfall,
        held_balance = held_balance + v_shortfall,
        updated_at = now()
    WHERE id = v_wallet.id AND COALESCE(balance, 0) >= v_shortfall;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
      RAISE EXCEPTION 'Insufficient available wallet funds to secure existing gig escrow (% / %, need %)',
        v_group.user_id, v_group.currency, v_shortfall;
    END IF;

    SELECT balance INTO v_balance_after
    FROM public.wallets WHERE id = v_wallet.id;
    INSERT INTO public.wallet_transactions
      (user_id, type, amount, currency, balance_after, status, description)
    VALUES
      (v_group.user_id, 'escrow_lock', v_shortfall, v_group.currency,
       v_balance_after, 'completed',
       'Existing accepted gig escrow reserved during workflow migration');
  END LOOP;
END;
$$;

UPDATE public.gigs g
SET escrow_amount = COALESCE((
  SELECT SUM(e.amount)
  FROM public.gig_application_escrows e
  WHERE e.gig_id = g.id AND e.status = 'held'
), 0)
WHERE g.payment_method = 'wallet'
  AND EXISTS (SELECT 1 FROM public.gig_application_escrows e WHERE e.gig_id = g.id);

ALTER TABLE public.gig_application_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_application_escrows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gig_application_payouts'
      AND policyname = 'Gig participants read application payouts'
  ) THEN
    CREATE POLICY "Gig participants read application payouts"
      ON public.gig_application_payouts FOR SELECT
      USING (
        auth.uid() = worker_id
        OR EXISTS (
          SELECT 1 FROM public.gigs g
          WHERE g.id = gig_id AND g.poster_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gig_application_escrows'
      AND policyname = 'Gig participants read application escrows'
  ) THEN
    CREATE POLICY "Gig participants read application escrows"
      ON public.gig_application_escrows FOR SELECT
      USING (auth.uid() = worker_id OR auth.uid() = poster_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.accept_gig_application(p_application_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.applications%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_accepted_count INTEGER;
  v_slots INTEGER;
  v_amount NUMERIC;
  v_locked BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;

  SELECT * INTO v_gig
  FROM public.gigs
  WHERE id = v_app.gig_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Gig not found'; END IF;

  SELECT * INTO v_app
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_gig.poster_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the gig poster can accept applications';
  END IF;
  IF v_app.status <> 'pending' THEN
    RAISE EXCEPTION 'This application is no longer pending';
  END IF;
  IF v_gig.status <> 'open' OR v_gig.deleted_at IS NOT NULL
     OR (v_gig.expires_at IS NOT NULL AND v_gig.expires_at <= now()) THEN
    RAISE EXCEPTION 'This gig is no longer accepting applications';
  END IF;

  v_slots := GREATEST(COALESCE(v_gig.slots, 1), 1);
  SELECT count(*) INTO v_accepted_count
  FROM public.applications
  WHERE gig_id = v_gig.id AND status IN ('accepted', 'completed');
  IF v_accepted_count >= v_slots THEN
    RAISE EXCEPTION 'All gig slots have been filled';
  END IF;

  IF v_gig.payment_method = 'wallet' THEN
    v_amount := COALESCE(v_gig.pay_min, 0);
    IF v_amount <= 0 THEN RAISE EXCEPTION 'Gig has no valid escrow amount'; END IF;
    v_locked := public.lock_gig_escrow(
      v_user_id, v_gig.id, v_amount, COALESCE(NULLIF(v_gig.currency, ''), 'NGN')
    );
    IF NOT v_locked THEN RAISE EXCEPTION 'Insufficient wallet balance to secure this worker'; END IF;
    INSERT INTO public.gig_application_escrows
      (application_id, gig_id, poster_id, worker_id, amount, currency, status)
    VALUES
      (v_app.id, v_gig.id, v_user_id, v_app.worker_id, v_amount,
       COALESCE(NULLIF(v_gig.currency, ''), 'NGN'), 'held')
    ON CONFLICT (application_id) DO UPDATE
      SET amount = EXCLUDED.amount, currency = EXCLUDED.currency,
          status = 'held', updated_at = now();
  ELSE
    v_amount := 0;
  END IF;

  UPDATE public.applications
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_app.id;

  v_accepted_count := v_accepted_count + 1;
  UPDATE public.gigs
  SET status = CASE WHEN v_accepted_count >= v_slots THEN 'in_progress' ELSE 'open' END,
      worker_id = COALESCE(worker_id, v_app.worker_id),
      worker_name = COALESCE(worker_name, (SELECT full_name FROM public.users WHERE id = v_app.worker_id)),
      accepted_at = COALESCE(accepted_at, now()),
      slots_filled = v_accepted_count,
      escrow_amount = CASE WHEN v_amount > 0 THEN COALESCE(escrow_amount, 0) + v_amount ELSE escrow_amount END
  WHERE id = v_gig.id;

  RETURN jsonb_build_object(
    'accepted_count', v_accepted_count,
    'slots', v_slots,
    'slots_full', v_accepted_count >= v_slots,
    'worker_id', v_app.worker_id,
    'escrow_amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_gig_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_gig_application(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_gig_application_escrow(p_application_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.applications%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_escrow public.gig_application_escrows%ROWTYPE;
  v_locked BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO v_gig FROM public.gigs WHERE id = v_app.gig_id FOR UPDATE;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  IF v_user_id <> v_gig.poster_id THEN RAISE EXCEPTION 'Only the poster can secure escrow'; END IF;
  IF v_gig.payment_method <> 'wallet' OR v_app.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'This application is not eligible for wallet escrow';
  END IF;

  SELECT * INTO v_escrow FROM public.gig_application_escrows
  WHERE application_id = v_app.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escrow record not found'; END IF;
  IF v_escrow.status = 'held' THEN RETURN TRUE; END IF;
  IF v_escrow.status = 'released' THEN RAISE EXCEPTION 'Escrow was already released'; END IF;

  v_locked := public.lock_gig_escrow(
    v_user_id, v_gig.id, v_escrow.amount, v_escrow.currency
  );
  IF NOT v_locked THEN RETURN FALSE; END IF;
  UPDATE public.gig_application_escrows SET status = 'held', updated_at = now()
  WHERE application_id = v_app.id;
  UPDATE public.gigs SET escrow_amount = COALESCE(escrow_amount, 0) + v_escrow.amount
  WHERE id = v_gig.id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_gig_application_escrow(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_gig_application_escrow(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_gig_application_escrow(p_application_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_admin BOOLEAN := false;
  v_app public.applications%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_escrow public.gig_application_escrows%ROWTYPE;
  v_new_balance NUMERIC;
  v_rows INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT COALESCE(is_admin, false) INTO v_is_admin FROM public.users WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO v_gig FROM public.gigs WHERE id = v_app.gig_id FOR UPDATE;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  SELECT * INTO v_escrow FROM public.gig_application_escrows
  WHERE application_id = v_app.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Escrow record not found'; END IF;
  IF v_escrow.status = 'refunded' THEN RETURN TRUE; END IF;
  IF v_escrow.status <> 'held' THEN RAISE EXCEPTION 'Escrow is not held'; END IF;

  UPDATE public.wallets
  SET balance = balance + v_escrow.amount,
      held_balance = held_balance - v_escrow.amount
  WHERE user_id = v_escrow.poster_id
    AND currency = v_escrow.currency
    AND held_balance >= v_escrow.amount;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Escrow balance is insufficient'; END IF;
  SELECT balance INTO v_new_balance FROM public.wallets
  WHERE user_id = v_escrow.poster_id AND currency = v_escrow.currency;
  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, balance_after, status, description)
  VALUES
    (v_escrow.poster_id, v_gig.id, 'escrow_refund', v_escrow.amount,
     v_escrow.currency, v_new_balance, 'completed', 'Escrow refunded after dispute resolution');

  UPDATE public.gig_application_escrows SET status = 'refunded', updated_at = now()
  WHERE application_id = v_app.id;
  UPDATE public.gigs SET escrow_amount = GREATEST(0, COALESCE(escrow_amount, 0) - v_escrow.amount)
  WHERE id = v_gig.id;
  UPDATE public.receipts SET disputed = false,
    dispute_reason = 'Resolved in favor of poster by admin',
    poster_confirmed = false, worker_confirmed = false,
    completed = false, status = 'pending'
  WHERE application_id = v_app.id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_gig_application_escrow(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_gig_application_escrow(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_wallet_gig_application(p_application_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.applications%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_receipt public.receipts%ROWTYPE;
  v_escrow public.gig_application_escrows%ROWTYPE;
  v_amount NUMERIC;
  v_currency TEXT;
  v_referral public.gig_referrals%ROWTYPE;
  v_referrer_share NUMERIC := 0;
  v_has_referral BOOLEAN := false;
  v_worker_share NUMERIC;
  v_worker_balance NUMERIC;
  v_referrer_balance NUMERIC;
  v_rows INTEGER;
  v_is_admin BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO v_gig FROM public.gigs WHERE id = v_app.gig_id FOR UPDATE;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;

  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM public.users WHERE id = v_user_id;
  IF v_app.worker_id <> v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only the accepted worker can confirm this completion';
  END IF;
  IF v_app.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'This application is not accepted';
  END IF;
  IF v_gig.payment_method <> 'wallet' THEN
    RAISE EXCEPTION 'This gig does not use wallet escrow';
  END IF;

  SELECT * INTO v_receipt FROM public.receipts
  WHERE application_id = v_app.id
     OR (application_id IS NULL AND gig_id = v_gig.id AND worker_id = v_app.worker_id)
  ORDER BY (application_id = v_app.id) DESC NULLS LAST
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT v_receipt.poster_confirmed THEN
    RAISE EXCEPTION 'The poster has not confirmed completion yet';
  END IF;

  IF EXISTS (SELECT 1 FROM public.gig_application_payouts WHERE application_id = v_app.id) THEN
    RETURN TRUE;
  END IF;
  IF v_receipt.disputed AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'This receipt is disputed';
  END IF;

  SELECT * INTO v_escrow FROM public.gig_application_escrows
  WHERE application_id = v_app.id FOR UPDATE;
  IF NOT FOUND OR v_escrow.status <> 'held' THEN
    RAISE EXCEPTION 'Escrow for this worker is not held';
  END IF;

  v_amount := COALESCE(v_receipt.amount, v_gig.pay_min);
  v_currency := COALESCE(NULLIF(v_receipt.currency, ''), NULLIF(v_gig.currency, ''), 'NGN');
  IF v_amount <= 0 THEN RAISE EXCEPTION 'Invalid payout amount'; END IF;
  IF v_amount <> v_escrow.amount OR v_currency <> v_escrow.currency THEN
    RAISE EXCEPTION 'Receipt amount or currency does not match this worker’s escrow';
  END IF;

  UPDATE public.wallets
  SET held_balance = held_balance - v_amount
  WHERE user_id = v_gig.poster_id
    AND currency = v_currency
    AND held_balance >= v_amount;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'Escrow balance is insufficient'; END IF;

  SELECT * INTO v_referral
  FROM public.gig_referrals
  WHERE gig_id = v_gig.id AND referred_id = v_app.worker_id
    AND status = 'pending' AND reward_given = false
  LIMIT 1 FOR UPDATE;
  IF FOUND AND v_referral.referrer_id IS NOT NULL THEN
    v_has_referral := true;
    v_referrer_share := ROUND(v_amount * 0.05, 2);
    INSERT INTO public.wallets (user_id, currency, balance, held_balance)
    VALUES (v_referral.referrer_id, v_currency, v_referrer_share, 0)
    ON CONFLICT (user_id, currency) DO UPDATE
      SET balance = public.wallets.balance + EXCLUDED.balance,
          updated_at = now();
    SELECT balance INTO v_referrer_balance FROM public.wallets
    WHERE user_id = v_referral.referrer_id AND currency = v_currency;
    INSERT INTO public.wallet_transactions
      (user_id, gig_id, type, amount, currency, balance_after, status, description)
    VALUES
      (v_referral.referrer_id, v_gig.id, 'gig_referral_payout', v_referrer_share,
       v_currency, v_referrer_balance, 'completed', 'Referral reward — 5% of gig payment');
    UPDATE public.gig_referrals SET status = 'completed', reward_given = true,
      gig_amount = v_amount, reward_amount = v_referrer_share,
      reward_currency = v_currency, completed_at = now()
    WHERE id = v_referral.id;
  END IF;

  -- A referred payout is 85% worker, 5% referrer, and 10% Prima.
  -- Without a referral it is 90% worker and 10% Prima.
  v_worker_share := ROUND(v_amount * CASE WHEN v_has_referral THEN 0.85 ELSE 0.90 END, 2);
  INSERT INTO public.wallets (user_id, currency, balance, held_balance)
  VALUES (v_app.worker_id, v_currency, v_worker_share, 0)
  ON CONFLICT (user_id, currency) DO UPDATE
    SET balance = public.wallets.balance + EXCLUDED.balance,
        updated_at = now();
  SELECT balance INTO v_worker_balance FROM public.wallets
  WHERE user_id = v_app.worker_id AND currency = v_currency;
  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, balance_after, status, description)
  VALUES
    (v_app.worker_id, v_gig.id, 'escrow_release_worker', v_worker_share,
     v_currency, v_worker_balance, 'completed', 'Payment released from gig escrow');

  INSERT INTO public.gig_application_payouts
    (application_id, gig_id, worker_id, amount, currency)
  VALUES (v_app.id, v_gig.id, v_app.worker_id, v_amount, v_currency);
  UPDATE public.gig_application_escrows
  SET status = 'released', updated_at = now()
  WHERE application_id = v_app.id;
  UPDATE public.gigs
  SET escrow_amount = GREATEST(0, COALESCE(escrow_amount, 0) - v_amount)
  WHERE id = v_gig.id;

  UPDATE public.receipts SET disputed = false,
    dispute_reason = CASE WHEN v_is_admin THEN 'Resolved in favor of worker by admin' ELSE NULL END,
    worker_confirmed = true, worker_confirmed_at = now(),
    completed = true, completed_at = now(), status = 'completed',
    commission_amount = ROUND(v_amount * 0.10, 2)
  WHERE id = v_receipt.id;
  UPDATE public.applications SET status = 'completed' WHERE id = v_app.id;
  PERFORM public.increment_gigs_completed(v_app.worker_id);

  IF COALESCE(v_gig.slots_filled, 1) >= GREATEST(COALESCE(v_gig.slots, 1), 1)
     AND NOT EXISTS (
       SELECT 1 FROM public.applications a
       LEFT JOIN public.receipts r ON r.application_id = a.id
       WHERE a.gig_id = v_gig.id AND a.status = 'accepted'
         AND COALESCE(r.completed, false) = false
     ) THEN
    UPDATE public.gigs SET status = 'completed' WHERE id = v_gig.id;
  END IF;
  RETURN FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_wallet_gig_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_wallet_gig_application(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_manual_gig_application(p_application_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_app public.applications%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_receipt public.receipts%ROWTYPE;
  v_commission public.commissions%ROWTYPE;
  v_commission_amount NUMERIC;
  v_already_completed BOOLEAN := false;
  v_is_admin BOOLEAN := false;
  v_referral public.gig_referrals%ROWTYPE;
  v_referrer_share NUMERIC := 0;
  v_referrer_balance NUMERIC;
  v_has_referral BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Application not found'; END IF;
  SELECT * INTO v_gig FROM public.gigs WHERE id = v_app.gig_id FOR UPDATE;
  SELECT * INTO v_app FROM public.applications WHERE id = p_application_id FOR UPDATE;
  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM public.users WHERE id = v_user_id;
  IF v_app.worker_id <> v_user_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Only the accepted worker can confirm this completion';
  END IF;
  IF v_app.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'This application is not accepted';
  END IF;
  IF v_gig.payment_method = 'wallet' THEN
    RAISE EXCEPTION 'Use wallet escrow completion for this gig';
  END IF;

  SELECT * INTO v_receipt FROM public.receipts
  WHERE application_id = v_app.id
     OR (application_id IS NULL AND gig_id = v_gig.id AND worker_id = v_app.worker_id)
  ORDER BY (application_id = v_app.id) DESC NULLS LAST
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT v_receipt.poster_confirmed THEN
    RAISE EXCEPTION 'The poster has not confirmed payment yet';
  END IF;
  IF v_receipt.disputed AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'This receipt is disputed';
  END IF;

  v_commission_amount := ROUND(COALESCE(v_receipt.amount, 0) * 0.10, 2);
  v_already_completed := v_receipt.completed OR v_app.status = 'completed';
  IF NOT v_already_completed THEN
    SELECT * INTO v_referral
    FROM public.gig_referrals
    WHERE gig_id = v_gig.id
      AND referred_id = v_app.worker_id
      AND status = 'pending'
      AND reward_given = false
    LIMIT 1 FOR UPDATE;
    IF FOUND AND v_referral.referrer_id IS NOT NULL THEN
      v_has_referral := true;
      v_commission_amount := ROUND(COALESCE(v_receipt.amount, 0) * 0.15, 2);
    END IF;

    SELECT * INTO v_commission FROM public.commissions
    WHERE gig_id = v_gig.id AND worker_id = v_app.worker_id
    LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      IF v_commission.status <> 'paid' THEN
        UPDATE public.commissions SET
          gig_amount = v_receipt.amount,
          commission_amount = v_commission_amount,
          currency = COALESCE(NULLIF(v_receipt.currency, ''), v_gig.currency, 'NGN'),
          status = 'pending',
          due_date = now() + interval '3 days'
        WHERE id = v_commission.id;
      END IF;
    ELSE
      INSERT INTO public.commissions
        (gig_id, worker_id, gig_amount, commission_amount, currency, status, due_date)
      VALUES
        (v_gig.id, v_app.worker_id, v_receipt.amount, v_commission_amount,
         COALESCE(NULLIF(v_receipt.currency, ''), v_gig.currency, 'NGN'),
         'pending', now() + interval '3 days');
    END IF;

    -- Pay a referred worker's reward in this same transaction so completion
    -- retries cannot duplicate or lose the credit.
    IF v_has_referral THEN
      v_referrer_share := ROUND(COALESCE(v_receipt.amount, 0) * 0.05, 2);
      IF v_referrer_share > 0 THEN
        INSERT INTO public.wallets (user_id, currency, balance, held_balance)
        VALUES (
          v_referral.referrer_id,
          COALESCE(NULLIF(v_receipt.currency, ''), NULLIF(v_gig.currency, ''), 'NGN'),
          v_referrer_share,
          0
        )
        ON CONFLICT (user_id, currency) DO UPDATE
          SET balance = public.wallets.balance + EXCLUDED.balance,
              updated_at = now();

        SELECT balance INTO v_referrer_balance
        FROM public.wallets
        WHERE user_id = v_referral.referrer_id
          AND currency = COALESCE(NULLIF(v_receipt.currency, ''), NULLIF(v_gig.currency, ''), 'NGN');

        INSERT INTO public.wallet_transactions
          (user_id, gig_id, type, amount, currency, balance_after, status, description)
        VALUES
          (v_referral.referrer_id, v_gig.id, 'gig_referral_payout', v_referrer_share,
           COALESCE(NULLIF(v_receipt.currency, ''), NULLIF(v_gig.currency, ''), 'NGN'),
           v_referrer_balance, 'completed', 'Gig referral reward - 5% of gig payment');

        UPDATE public.gig_referrals SET status = 'completed', reward_given = true,
          gig_amount = v_receipt.amount, reward_amount = v_referrer_share,
          reward_currency = COALESCE(NULLIF(v_receipt.currency, ''), NULLIF(v_gig.currency, ''), 'NGN'),
          completed_at = now()
        WHERE id = v_referral.id;

        INSERT INTO public.notifications (user_id, title, message, type, gig_id)
        VALUES (
          v_referral.referrer_id,
          'Gig Referral Reward!',
          format('You earned %s %s for referring this gig.',
            COALESCE(NULLIF(v_receipt.currency, ''), NULLIF(v_gig.currency, ''), 'NGN'),
            to_char(v_referrer_share, 'FM999,999,999,990.00')),
          'wallet',
          v_gig.id
        );
      END IF;
    END IF;

    UPDATE public.receipts SET disputed = false,
      dispute_reason = CASE WHEN v_is_admin THEN 'Resolved in favor of worker by admin' ELSE NULL END,
      worker_confirmed = true, worker_confirmed_at = now(),
      completed = true, completed_at = now(), status = 'completed',
      commission_amount = v_commission_amount
    WHERE id = v_receipt.id;
    UPDATE public.applications SET status = 'completed' WHERE id = v_app.id;
    PERFORM public.increment_gigs_completed(v_app.worker_id);

    IF COALESCE(v_gig.slots_filled, 1) >= GREATEST(COALESCE(v_gig.slots, 1), 1)
       AND NOT EXISTS (
         SELECT 1 FROM public.applications a
         WHERE a.gig_id = v_gig.id AND a.status = 'accepted'
       ) THEN
      UPDATE public.gigs SET status = 'completed' WHERE id = v_gig.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'already_completed', v_already_completed,
    'commission_amount', v_commission_amount,
    'receipt_amount', v_receipt.amount,
    'currency', COALESCE(NULLIF(v_receipt.currency, ''), v_gig.currency, 'NGN')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_manual_gig_application(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_manual_gig_application(UUID) TO authenticated;
