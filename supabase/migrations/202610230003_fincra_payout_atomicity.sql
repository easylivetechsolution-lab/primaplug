-- Reserve wallet withdrawals and settle their provider callbacks atomically.
-- This prevents lost balances on insert failures and duplicate webhook refunds.

CREATE OR REPLACE FUNCTION public.reserve_fincra_commission_payment(
  p_commission_id UUID,
  p_user_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_commission public.commissions%ROWTYPE;
  v_pending_reference TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_commission FROM public.commissions
  WHERE id = p_commission_id AND worker_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_commission.status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'commission_not_pending');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0
     OR ROUND(p_amount, 2) <> ROUND(v_commission.commission_amount, 2)
     OR UPPER(COALESCE(p_currency, 'NGN')) <>
        UPPER(COALESCE(NULLIF(v_commission.currency, ''), 'NGN')) THEN
    RETURN jsonb_build_object('status', 'commission_amount_mismatch');
  END IF;

  SELECT fincra_reference INTO v_pending_reference
  FROM public.wallet_transactions
  WHERE related_commission_id = v_commission.id
    AND type = 'fund_in' AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;
  IF v_pending_reference IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_pending',
      'reference', v_pending_reference);
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, currency, fincra_reference, status, description, related_commission_id)
  VALUES
    (p_user_id, 'fund_in', p_amount, p_currency, p_reference, 'pending',
     'Commission payment for gig', v_commission.id);
  RETURN jsonb_build_object('status', 'reserved', 'reference', p_reference);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_fincra_wallet_withdrawal(
  p_user_id UUID,
  p_currency TEXT,
  p_amount NUMERIC,
  p_reference TEXT,
  p_description TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance NUMERIC;
  v_transaction_id UUID;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR NULLIF(p_reference, '') IS NULL THEN
    RAISE EXCEPTION 'Valid amount and provider reference are required';
  END IF;

  v_balance := public._debit_wallet(p_user_id, p_currency, p_amount);
  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('status', 'insufficient_balance');
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount, currency, fincra_reference, status, balance_after, description)
  VALUES
    (p_user_id, 'withdrawal', p_amount, p_currency, p_reference,
     'pending', v_balance, p_description)
  RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object('status', 'reserved', 'transaction_id', v_transaction_id,
    'balance', v_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_fincra_wallet_payout(
  p_reference TEXT,
  p_success BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tx public.wallet_transactions%ROWTYPE;
  v_balance NUMERIC;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_tx FROM public.wallet_transactions
  WHERE fincra_reference = p_reference AND type = 'withdrawal'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_tx.status <> 'pending' THEN
    RETURN jsonb_build_object('status', v_tx.status, 'already_processed', true,
      'transaction_id', v_tx.id);
  END IF;

  IF p_success THEN
    UPDATE public.wallet_transactions SET status = 'completed'
    WHERE id = v_tx.id;
    INSERT INTO public.notifications
      (user_id, title, message, type, wallet_transaction_id)
    VALUES (v_tx.user_id, '✅ Withdrawal Successful',
      format('Your withdrawal of %s %s has been sent to your bank account.',
        v_tx.currency, to_char(v_tx.amount, 'FM999,999,999,990.00')),
      'wallet', v_tx.id)
    ON CONFLICT (wallet_transaction_id)
      WHERE wallet_transaction_id IS NOT NULL DO NOTHING;
    RETURN jsonb_build_object('status', 'completed', 'already_processed', false,
      'transaction_id', v_tx.id);
  END IF;

  v_balance := public._credit_wallet(v_tx.user_id, v_tx.currency, v_tx.amount);
  UPDATE public.wallet_transactions
  SET status = 'failed', balance_after = v_balance,
      description = COALESCE(description, '') || ' - REFUNDED'
  WHERE id = v_tx.id;
  INSERT INTO public.notifications
    (user_id, title, message, type, wallet_transaction_id)
  VALUES (v_tx.user_id, '❌ Withdrawal Failed',
    format('Your withdrawal of %s %s failed and was refunded to your wallet.',
      v_tx.currency, to_char(v_tx.amount, 'FM999,999,999,990.00')),
    'wallet', v_tx.id)
  ON CONFLICT (wallet_transaction_id)
    WHERE wallet_transaction_id IS NOT NULL DO NOTHING;
  RETURN jsonb_build_object('status', 'failed', 'already_processed', false,
    'transaction_id', v_tx.id, 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_fincra_wallet_withdrawal(UUID, TEXT, NUMERIC, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_fincra_commission_payment(UUID, UUID, NUMERIC, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_fincra_wallet_payout(TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_fincra_wallet_withdrawal(UUID, TEXT, NUMERIC, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_fincra_commission_payment(UUID, UUID, NUMERIC, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.process_fincra_wallet_payout(TEXT, BOOLEAN)
  TO service_role;
