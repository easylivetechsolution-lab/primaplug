-- Restrict balance-changing helpers to trusted callers and make commission
-- settlement atomic. Security-definer application RPCs still call these as
-- their owner; edge functions use the service_role grant.

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS related_commission_id UUID
    REFERENCES public.commissions(id) ON DELETE SET NULL;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS wallet_transaction_id UUID
    REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_wallet_transaction_unique
  ON public.notifications(wallet_transaction_id)
  WHERE wallet_transaction_id IS NOT NULL;

REVOKE ALL ON FUNCTION public._credit_wallet(UUID, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._debit_wallet(UUID, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._credit_wallet(UUID, TEXT, NUMERIC)
  TO service_role;
GRANT EXECUTE ON FUNCTION public._debit_wallet(UUID, TEXT, NUMERIC)
  TO service_role;

REVOKE ALL ON FUNCTION public.lock_gig_escrow(UUID, UUID, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_gig_escrow(UUID, UUID, UUID, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_gig_escrow_with_referral(UUID, UUID, UUID, NUMERIC, UUID, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unlock_gig_escrow(UUID, UUID, NUMERIC, TEXT)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pay_commission_from_wallet(p_commission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_commission public.commissions%ROWTYPE;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_commission
  FROM public.commissions
  WHERE id = p_commission_id AND worker_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;
  IF v_commission.status = 'paid' THEN
    RETURN jsonb_build_object('status', 'paid', 'already_paid', true);
  END IF;
  IF v_commission.status <> 'pending' THEN
    RAISE EXCEPTION 'Commission is not pending';
  END IF;

  v_currency := COALESCE(NULLIF(v_commission.currency, ''), 'NGN');
  v_balance := public._debit_wallet(
    v_user_id, v_currency, v_commission.commission_amount
  );
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  UPDATE public.commissions
  SET status = 'paid', paid_at = now(), payment_method = 'wallet'
  WHERE id = v_commission.id AND status = 'pending';

  INSERT INTO public.wallet_transactions
    (user_id, gig_id, type, amount, currency, status, balance_after, description)
  VALUES
    (v_user_id, v_commission.gig_id, 'commission_payment',
     v_commission.commission_amount, v_currency, 'completed', v_balance,
     'Platform commission paid from wallet');

  PERFORM public.check_commission_status(v_user_id);
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (v_user_id, 'Commission Paid',
    'Your platform commission was paid from your wallet.', 'general');

  RETURN jsonb_build_object('status', 'paid', 'already_paid', false,
    'commission_id', v_commission.id, 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.pay_commission_from_wallet(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_commission_from_wallet(UUID) TO authenticated;

-- A commission checkout is recorded as a fund_in transaction by the existing
-- Fincra flow. Settle the referenced commission instead of crediting the
-- worker's wallet. Other fund_in transactions remain wallet deposits.
CREATE OR REPLACE FUNCTION public.complete_fincra_wallet_funding(p_reference TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.wallet_transactions%ROWTYPE;
  v_commission public.commissions%ROWTYPE;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_tx
  FROM public.wallet_transactions
  WHERE fincra_reference = p_reference AND type = 'fund_in'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_tx.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'completed', 'already_completed', true,
      'transaction_id', v_tx.id, 'balance', v_tx.balance_after);
  END IF;
  IF v_tx.status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'not_pending', 'transaction_id', v_tx.id);
  END IF;

  IF v_tx.related_commission_id IS NOT NULL THEN
    SELECT * INTO v_commission
    FROM public.commissions
    WHERE id = v_tx.related_commission_id AND worker_id = v_tx.user_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'commission_not_found',
        'transaction_id', v_tx.id);
    END IF;
    IF UPPER(COALESCE(NULLIF(v_tx.currency, ''), 'NGN')) <>
       UPPER(COALESCE(NULLIF(v_commission.currency, ''), 'NGN')) OR
       ROUND(v_tx.amount, 2) <> ROUND(v_commission.commission_amount, 2) THEN
      RETURN jsonb_build_object('status', 'commission_amount_mismatch',
        'transaction_id', v_tx.id);
    END IF;
    IF v_commission.status = 'paid' THEN
      -- Keep this successful provider payment visible for manual refund or
      -- reconciliation; never silently credit it or mark it settled twice.
      RETURN jsonb_build_object('status', 'commission_already_paid',
        'transaction_id', v_tx.id, 'commission_payment', true);
    ELSIF v_commission.status <> 'pending' THEN
      RETURN jsonb_build_object('status', 'commission_not_pending',
        'transaction_id', v_tx.id);
    END IF;

    UPDATE public.commissions
    SET status = 'paid', paid_at = now(), payment_method = 'fincra'
    WHERE id = v_commission.id AND status = 'pending';
    PERFORM public.check_commission_status(v_tx.user_id);
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (v_tx.user_id, 'Commission Paid',
      format('Your platform commission of %s %s was paid via Fincra.',
        COALESCE(NULLIF(v_commission.currency, ''), 'NGN'),
        to_char(v_commission.commission_amount, 'FM999,999,999,990.00')),
      'general');

    UPDATE public.wallet_transactions SET status = 'completed'
    WHERE id = v_tx.id;
    RETURN jsonb_build_object('status', 'completed', 'already_completed', false,
      'commission_payment', true,
      'transaction_id', v_tx.id);
  END IF;

  v_currency := COALESCE(NULLIF(v_tx.currency, ''), 'NGN');
  SELECT public._credit_wallet(v_tx.user_id, v_currency, v_tx.amount)
    INTO v_balance;
  UPDATE public.wallet_transactions
  SET status = 'completed', balance_after = v_balance
  WHERE id = v_tx.id;
  INSERT INTO public.notifications
    (user_id, title, message, type, wallet_transaction_id)
  VALUES (v_tx.user_id, 'Wallet Funded',
    format('Your %s wallet has been credited with %s %s',
      v_currency, v_currency, to_char(v_tx.amount, 'FM999,999,999,990.00')),
    'wallet', v_tx.id)
  ON CONFLICT (wallet_transaction_id)
    WHERE wallet_transaction_id IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object('status', 'completed', 'already_completed', false,
    'transaction_id', v_tx.id, 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_fincra_wallet_funding(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_fincra_wallet_funding(TEXT) TO service_role;

-- Re-apply the latest completion implementations so this migration also
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
