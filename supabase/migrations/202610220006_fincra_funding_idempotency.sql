-- A webhook and the browser return verifier can confirm the same payment.
-- Complete each funding transaction once, by its exact merchant reference.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS wallet_transaction_id UUID
    REFERENCES public.wallet_transactions(id) ON DELETE SET NULL;

WITH ranked_wallet_notifications AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY wallet_transaction_id
           ORDER BY created_at ASC, id ASC
         ) AS row_number
  FROM public.notifications
  WHERE wallet_transaction_id IS NOT NULL
)
DELETE FROM public.notifications n
USING ranked_wallet_notifications r
WHERE n.id = r.id
  AND r.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_wallet_transaction_unique
  ON public.notifications(wallet_transaction_id)
  WHERE wallet_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_fincra_wallet_funding(p_reference TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.wallet_transactions%ROWTYPE;
  v_balance NUMERIC;
  v_currency TEXT;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_tx
  FROM public.wallet_transactions
  WHERE fincra_reference = p_reference
    AND type = 'fund_in'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_tx.status = 'completed' THEN
    RETURN jsonb_build_object(
      'status', 'completed',
      'already_completed', true,
      'transaction_id', v_tx.id,
      'balance', v_tx.balance_after
    );
  END IF;

  IF v_tx.status <> 'pending' THEN
    RETURN jsonb_build_object('status', 'not_pending', 'transaction_id', v_tx.id);
  END IF;

  v_currency := COALESCE(NULLIF(v_tx.currency, ''), 'NGN');
  SELECT public._credit_wallet(v_tx.user_id, v_currency, v_tx.amount)
    INTO v_balance;

  UPDATE public.wallet_transactions
  SET status = 'completed', balance_after = v_balance
  WHERE id = v_tx.id;

  INSERT INTO public.notifications (
    user_id, title, message, type, wallet_transaction_id
  ) VALUES (
    v_tx.user_id,
    '💰 Wallet Funded',
    format('Your %s wallet has been credited with %s %s',
      v_currency, v_currency, to_char(v_tx.amount, 'FM999,999,999,990.00')),
    'wallet',
    v_tx.id
  )
  ON CONFLICT (wallet_transaction_id)
    WHERE wallet_transaction_id IS NOT NULL
    DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'completed',
    'already_completed', false,
    'transaction_id', v_tx.id,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_fincra_wallet_funding(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_fincra_wallet_funding(TEXT) TO service_role;
