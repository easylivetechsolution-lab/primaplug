-- Give administrators a controlled way to resolve cross-currency payouts
-- where Fincra completed conversion but the destination payout failed.

ALTER TABLE public.credit_withdrawals
  ADD COLUMN IF NOT EXISTS recovery_resolution TEXT
    CHECK (recovery_resolution IN ('payout_completed', 'funds_returned_credit_refunded')),
  ADD COLUMN IF NOT EXISTS recovery_notes TEXT,
  ADD COLUMN IF NOT EXISTS recovered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.resolve_credit_withdrawal_recovery(
  p_reference TEXT,
  p_resolution TEXT,
  p_admin_user_id UUID,
  p_notes TEXT,
  p_fincra_payout_id TEXT DEFAULT NULL,
  p_funds_returned BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_withdrawal public.credit_withdrawals%ROWTYPE;
  v_credits public.prima_credits%ROWTYPE;
  v_user_balance NUMERIC;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_admin_user_id IS NULL OR p_resolution IS NULL
     OR p_resolution NOT IN ('payout_completed', 'funds_returned_credit_refunded')
     OR length(trim(COALESCE(p_notes, ''))) < 5 THEN
    RAISE EXCEPTION 'Administrator, valid resolution, and reconciliation notes are required';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.credit_withdrawals
  WHERE fincra_reference = p_reference
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_withdrawal.status IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('status', v_withdrawal.status,
      'already_resolved', true, 'withdrawal_id', v_withdrawal.id);
  END IF;
  IF v_withdrawal.status <> 'recovery_required' THEN
    RETURN jsonb_build_object('status', v_withdrawal.status,
      'already_resolved', false, 'withdrawal_id', v_withdrawal.id);
  END IF;

  IF p_resolution = 'payout_completed' THEN
    UPDATE public.credit_withdrawals
    SET status = 'completed',
        fincra_payout_id = COALESCE(NULLIF(p_fincra_payout_id, ''), fincra_payout_id),
        recovery_resolution = p_resolution,
        recovery_notes = trim(p_notes),
        recovered_by = p_admin_user_id,
        recovered_at = now(),
        settled_at = now()
    WHERE id = v_withdrawal.id;
    RETURN jsonb_build_object('status', 'completed', 'already_resolved', false,
      'withdrawal_id', v_withdrawal.id);
  END IF;

  IF p_funds_returned IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Confirm Fincra returned the converted funds before refunding credits';
  END IF;

  SELECT * INTO v_credits
  FROM public.prima_credits
  WHERE user_id = v_withdrawal.user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit balance row missing for withdrawal'; END IF;

  SELECT COALESCE(credits_balance, 0) INTO v_user_balance
  FROM public.users
  WHERE id = v_withdrawal.user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User row missing for withdrawal refund'; END IF;
  IF v_user_balance <> COALESCE(v_credits.balance, 0) THEN
    RAISE EXCEPTION 'Credit balance mismatch; reconcile before refunding';
  END IF;

  UPDATE public.prima_credits
  SET balance = COALESCE(balance, 0) + v_withdrawal.credits_amount,
      lifetime_spent = GREATEST(0, COALESCE(lifetime_spent, 0) - v_withdrawal.credits_amount),
      updated_at = now()
  WHERE id = v_credits.id;
  UPDATE public.users
  SET credits_balance = COALESCE(credits_balance, 0) + v_withdrawal.credits_amount
  WHERE id = v_withdrawal.user_id;
  INSERT INTO public.credit_transactions
    (user_id, amount, type, description, gig_id)
  VALUES
    (v_withdrawal.user_id, v_withdrawal.credits_amount, 'withdrawal_refund',
     format('Admin reconciliation refund for credit withdrawal %s', p_reference), NULL);

  UPDATE public.credit_withdrawals
  SET status = 'failed',
      recovery_resolution = p_resolution,
      recovery_notes = trim(p_notes),
      recovered_by = p_admin_user_id,
      recovered_at = now(),
      settled_at = now()
  WHERE id = v_withdrawal.id;
  RETURN jsonb_build_object('status', 'failed', 'already_resolved', false,
    'withdrawal_id', v_withdrawal.id,
    'refunded_credits', v_withdrawal.credits_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_credit_withdrawal_recovery(TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_credit_withdrawal_recovery(TEXT, TEXT, UUID, TEXT, TEXT, BOOLEAN)
  TO service_role;
