-- Reserve credit withdrawals against an expiring Fincra quote and settle them
-- exactly once. Credit values are denominated in USD at 50 credits per USD.

CREATE TABLE IF NOT EXISTS public.credit_withdrawal_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_amount NUMERIC NOT NULL CHECK (credits_amount >= 500),
  usd_amount NUMERIC NOT NULL CHECK (usd_amount > 0),
  source_currency TEXT NOT NULL DEFAULT 'USD',
  destination_currency TEXT NOT NULL,
  destination_country TEXT NOT NULL CHECK (destination_country ~ '^[A-Z]{2}$'),
  payment_scheme TEXT,
  destination_amount NUMERIC NOT NULL CHECK (destination_amount > 0),
  exchange_rate NUMERIC NOT NULL CHECK (exchange_rate > 0),
  provider_fee NUMERIC NOT NULL DEFAULT 0 CHECK (provider_fee >= 0),
  fincra_quote_reference TEXT UNIQUE,
  quote_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 seconds'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_withdrawal_quote_usd_matches_credits
    CHECK (ROUND(usd_amount, 2) = ROUND(credits_amount / 50, 2))
);

CREATE TABLE IF NOT EXISTS public.credit_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  quote_id UUID NOT NULL UNIQUE REFERENCES public.credit_withdrawal_quotes(id),
  credits_amount NUMERIC NOT NULL CHECK (credits_amount >= 500),
  usd_amount NUMERIC NOT NULL CHECK (usd_amount > 0),
  source_currency TEXT NOT NULL DEFAULT 'USD',
  destination_currency TEXT NOT NULL,
  destination_country TEXT NOT NULL CHECK (destination_country ~ '^[A-Z]{2}$'),
  payment_scheme TEXT,
  destination_amount NUMERIC NOT NULL CHECK (destination_amount > 0),
  exchange_rate NUMERIC NOT NULL CHECK (exchange_rate > 0),
  provider_fee NUMERIC NOT NULL DEFAULT 0 CHECK (provider_fee >= 0),
  fincra_quote_reference TEXT,
  fincra_reference TEXT NOT NULL UNIQUE,
  fincra_payout_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'recovery_required')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS credit_withdrawals_user_created_idx
  ON public.credit_withdrawals(user_id, created_at DESC);

-- Make every existing credit spend atomic too, so it cannot race a withdrawal
-- or another spend and drive the balance below zero.
CREATE OR REPLACE FUNCTION public.spend_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_description TEXT,
  p_gig_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_credit_balance NUMERIC;
  v_user_balance NUMERIC;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Cannot spend another user''s credits';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN false; END IF;

  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM public.prima_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_credit_balance < p_amount THEN RETURN false; END IF;

  SELECT COALESCE(credits_balance, 0) INTO v_user_balance
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_user_balance < p_amount THEN RETURN false; END IF;
  IF v_user_balance <> v_credit_balance THEN RETURN false; END IF;

  UPDATE public.prima_credits
  SET balance = COALESCE(balance, 0) - p_amount,
      lifetime_spent = COALESCE(lifetime_spent, 0) + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
    AND balance >= p_amount;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.users
  SET credits_balance = COALESCE(credits_balance, 0) - p_amount
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, description, gig_id)
  VALUES (p_user_id, -p_amount, p_type, p_description, p_gig_id);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.spend_credits(UUID, NUMERIC, TEXT, TEXT, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(UUID, NUMERIC, TEXT, TEXT, UUID)
  TO authenticated, service_role;

ALTER TABLE public.credit_withdrawal_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_withdrawal_quotes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.credit_withdrawals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.credit_withdrawal_quotes TO service_role;
GRANT ALL ON public.credit_withdrawals TO service_role;
GRANT SELECT ON public.credit_withdrawals TO authenticated;
DROP POLICY IF EXISTS credit_withdrawals_read_own ON public.credit_withdrawals;
CREATE POLICY credit_withdrawals_read_own ON public.credit_withdrawals
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.create_credit_withdrawal_quote(
  p_user_id UUID,
  p_credits_amount NUMERIC,
  p_usd_amount NUMERIC,
  p_destination_currency TEXT,
  p_destination_country TEXT,
  p_payment_scheme TEXT,
  p_destination_amount NUMERIC,
  p_exchange_rate NUMERIC,
  p_provider_fee NUMERIC,
  p_fincra_quote_reference TEXT,
  p_quote_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_credits_amount IS NULL OR p_credits_amount < 500
     OR p_credits_amount <> trunc(p_credits_amount)
     OR ROUND(p_usd_amount, 2) <> ROUND(p_credits_amount / 50, 2)
     OR NULLIF(p_destination_currency, '') IS NULL
     OR COALESCE(p_destination_country, '') !~ '^[A-Z]{2}$'
     OR p_destination_amount IS NULL OR p_destination_amount <= 0
     OR p_exchange_rate IS NULL OR p_exchange_rate <= 0
     OR (UPPER(p_destination_currency) <> 'USD' AND NULLIF(p_fincra_quote_reference, '') IS NULL) THEN
    RAISE EXCEPTION 'Invalid credit withdrawal quote';
  END IF;

  v_expires_at := COALESCE(
    NULLIF(p_quote_payload->>'expireAt', '')::TIMESTAMPTZ,
    now() + INTERVAL '30 seconds'
  );
  IF v_expires_at <= now() THEN
    RAISE EXCEPTION 'Fincra payout quote has expired';
  END IF;

  INSERT INTO public.credit_withdrawal_quotes (
    user_id, credits_amount, usd_amount, destination_currency,
    destination_country, payment_scheme,
    destination_amount, exchange_rate, provider_fee,
    fincra_quote_reference, quote_payload, expires_at
  ) VALUES (
    p_user_id, p_credits_amount, p_usd_amount, UPPER(p_destination_currency),
    UPPER(p_destination_country), NULLIF(LOWER(p_payment_scheme), ''),
    p_destination_amount, p_exchange_rate, COALESCE(p_provider_fee, 0),
    p_fincra_quote_reference, COALESCE(p_quote_payload, '{}'::JSONB), v_expires_at
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'quoted', 'quote_id', v_id,
    'expires_in_seconds', GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_expires_at - now())))::INTEGER));
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_credit_withdrawal(
  p_user_id UUID,
  p_quote_id UUID,
  p_fincra_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quote public.credit_withdrawal_quotes%ROWTYPE;
  v_credits public.prima_credits%ROWTYPE;
  v_user_balance NUMERIC;
  v_withdrawal_id UUID;
  v_existing public.credit_withdrawals%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF NULLIF(p_fincra_reference, '') IS NULL THEN
    RAISE EXCEPTION 'Provider reference is required';
  END IF;

  SELECT * INTO v_quote
  FROM public.credit_withdrawal_quotes
  WHERE id = p_quote_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'quote_not_found'); END IF;

  SELECT * INTO v_existing FROM public.credit_withdrawals
  WHERE quote_id = p_quote_id AND user_id = p_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object('status', v_existing.status,
      'already_reserved', true, 'withdrawal_id', v_existing.id,
      'reference', v_existing.fincra_reference,
      'usd_amount', v_existing.usd_amount,
      'source_currency', v_existing.source_currency,
      'destination_currency', v_existing.destination_currency,
      'destination_country', v_existing.destination_country,
      'payment_scheme', v_existing.payment_scheme,
      'destination_amount', v_existing.destination_amount,
      'quote_reference', v_existing.fincra_quote_reference);
  END IF;
  IF v_quote.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'quote_already_used');
  END IF;
  IF v_quote.expires_at <= now() THEN
    RETURN jsonb_build_object('status', 'quote_expired');
  END IF;

  SELECT * INTO v_credits
  FROM public.prima_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR COALESCE(v_credits.balance, 0) < v_quote.credits_amount THEN
    RETURN jsonb_build_object('status', 'insufficient_credits');
  END IF;

  SELECT COALESCE(credits_balance, 0) INTO v_user_balance
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_user_balance <> COALESCE(v_credits.balance, 0) THEN
    RETURN jsonb_build_object('status', 'credit_balance_mismatch');
  END IF;
  IF v_user_balance < v_quote.credits_amount THEN
    RETURN jsonb_build_object('status', 'insufficient_credits');
  END IF;

  UPDATE public.users
  SET credits_balance = COALESCE(credits_balance, 0) - v_quote.credits_amount
  WHERE id = p_user_id AND COALESCE(credits_balance, 0) >= v_quote.credits_amount;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'credit_balance_mismatch');
  END IF;

  UPDATE public.prima_credits
  SET balance = balance - v_quote.credits_amount,
      lifetime_spent = COALESCE(lifetime_spent, 0) + v_quote.credits_amount,
      updated_at = now()
  WHERE id = v_credits.id;

  INSERT INTO public.credit_transactions
    (user_id, amount, type, description, gig_id)
  VALUES
    (p_user_id, -v_quote.credits_amount, 'withdrawal',
     format('Credit withdrawal: %s %s for USD %s',
       v_quote.destination_currency, v_quote.destination_amount,
       to_char(v_quote.usd_amount, 'FM999999990.00')), NULL);

  INSERT INTO public.credit_withdrawals (
    user_id, quote_id, credits_amount, usd_amount, source_currency,
    destination_currency, destination_country, payment_scheme,
    destination_amount, exchange_rate, provider_fee,
    fincra_quote_reference, fincra_reference
  ) VALUES (
    p_user_id, v_quote.id, v_quote.credits_amount, v_quote.usd_amount,
    v_quote.source_currency, v_quote.destination_currency,
    v_quote.destination_country, v_quote.payment_scheme,
    v_quote.destination_amount, v_quote.exchange_rate, v_quote.provider_fee,
    v_quote.fincra_quote_reference, p_fincra_reference
  ) RETURNING id INTO v_withdrawal_id;

  UPDATE public.credit_withdrawal_quotes SET used_at = now() WHERE id = v_quote.id;
  RETURN jsonb_build_object('status', 'reserved', 'withdrawal_id', v_withdrawal_id,
    'reference', p_fincra_reference, 'usd_amount', v_quote.usd_amount,
    'source_currency', v_quote.source_currency,
    'destination_currency', v_quote.destination_currency,
    'destination_country', v_quote.destination_country,
    'payment_scheme', v_quote.payment_scheme,
    'destination_amount', v_quote.destination_amount,
    'quote_reference', v_quote.fincra_quote_reference);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_credit_fincra_payout(
  p_reference TEXT,
  p_success BOOLEAN,
  p_conversion_success BOOLEAN DEFAULT NULL,
  p_fincra_payout_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_withdrawal public.credit_withdrawals%ROWTYPE;
  v_credits public.prima_credits%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_success IS NULL THEN
    RAISE EXCEPTION 'Payout outcome is required';
  END IF;

  SELECT * INTO v_withdrawal
  FROM public.credit_withdrawals
  WHERE fincra_reference = p_reference
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_withdrawal.status IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('status', v_withdrawal.status,
      'already_processed', true, 'withdrawal_id', v_withdrawal.id);
  END IF;
  IF v_withdrawal.status = 'recovery_required' AND NOT p_success THEN
    -- Once routed to manual reconciliation, later payout-failure callbacks
    -- must not automatically refund the user's source credits.
    RETURN jsonb_build_object('status', 'recovery_required',
      'already_processed', true, 'withdrawal_id', v_withdrawal.id);
  END IF;

  IF p_success THEN
    UPDATE public.credit_withdrawals
    SET status = 'completed', fincra_payout_id = p_fincra_payout_id, settled_at = now()
    WHERE id = v_withdrawal.id;
    RETURN jsonb_build_object('status', 'completed', 'already_processed', false,
      'withdrawal_id', v_withdrawal.id);
  END IF;

  -- Fincra may complete the FX conversion before the bank payout. If a
  -- cross-currency payout fails, the destination funds can remain in Prima's
  -- Fincra wallet. Keep the user's credits reserved until that is reconciled;
  -- refunding here could pay the user twice.
  IF v_withdrawal.source_currency <> v_withdrawal.destination_currency
     AND p_conversion_success IS DISTINCT FROM FALSE THEN
    UPDATE public.credit_withdrawals
    SET status = 'recovery_required'
    WHERE id = v_withdrawal.id;
    RETURN jsonb_build_object('status', 'recovery_required',
      'already_processed', false, 'withdrawal_id', v_withdrawal.id);
  END IF;

  SELECT * INTO v_credits FROM public.prima_credits
  WHERE user_id = v_withdrawal.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit balance row missing for withdrawal'; END IF;

  UPDATE public.prima_credits
  SET balance = COALESCE(balance, 0) + v_withdrawal.credits_amount,
      lifetime_spent = GREATEST(0, COALESCE(lifetime_spent, 0) - v_withdrawal.credits_amount),
      updated_at = now()
  WHERE id = v_credits.id;

  UPDATE public.users
  SET credits_balance = COALESCE(credits_balance, 0) + v_withdrawal.credits_amount
  WHERE id = v_withdrawal.user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User row missing for withdrawal refund'; END IF;

  INSERT INTO public.credit_transactions
    (user_id, amount, type, description, gig_id)
  VALUES
    (v_withdrawal.user_id, v_withdrawal.credits_amount, 'withdrawal_refund',
     format('Refund for failed credit withdrawal %s', p_reference), NULL);

  UPDATE public.credit_withdrawals
  SET status = 'failed', settled_at = now()
  WHERE id = v_withdrawal.id;
  RETURN jsonb_build_object('status', 'failed', 'already_processed', false,
    'withdrawal_id', v_withdrawal.id, 'refunded_credits', v_withdrawal.credits_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.create_credit_withdrawal_quote(UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_credit_withdrawal(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_credit_fincra_payout(TEXT, BOOLEAN, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_credit_withdrawal_quote(UUID, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_credit_withdrawal(UUID, UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.process_credit_fincra_payout(TEXT, BOOLEAN, BOOLEAN, TEXT)
  TO service_role;
