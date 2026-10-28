-- Close a worker-confirmed payment dispute and complete the gig in one
-- transaction, so a settlement failure cannot leave the dispute cleared.
BEGIN;

CREATE OR REPLACE FUNCTION public.confirm_worker_dispute_payment(p_application_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_worker_id UUID := auth.uid();
  v_application public.applications%ROWTYPE;
  v_gig public.gigs%ROWTYPE;
  v_receipt public.receipts%ROWTYPE;
  v_result JSONB;
  v_already_completed BOOLEAN;
BEGIN
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  SELECT * INTO v_application
  FROM public.applications
  WHERE id = p_application_id;

  IF NOT FOUND OR v_application.worker_id <> v_worker_id THEN
    RAISE EXCEPTION 'Only the worker on this application can confirm the disputed payment';
  END IF;
  IF v_application.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'This application is not active';
  END IF;

  SELECT * INTO v_gig
  FROM public.gigs
  WHERE id = v_application.gig_id
  FOR UPDATE;

  SELECT * INTO v_application
  FROM public.applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF v_application.worker_id <> v_worker_id
     OR v_application.status NOT IN ('accepted', 'completed') THEN
    RAISE EXCEPTION 'This application is no longer available for worker confirmation';
  END IF;

  SELECT * INTO v_receipt
  FROM public.receipts
  WHERE application_id = v_application.id
     OR (application_id IS NULL AND gig_id = v_gig.id AND worker_id = v_worker_id)
  ORDER BY (application_id = v_application.id) DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No open payment dispute was found';
  END IF;
  IF v_receipt.disputed IS DISTINCT FROM TRUE THEN
    IF v_receipt.completed AND v_receipt.worker_confirmed THEN
      RETURN jsonb_build_object('already_completed', TRUE, 'payment_method', v_gig.payment_method);
    END IF;
    RAISE EXCEPTION 'No open payment dispute was found';
  END IF;
  IF v_receipt.poster_confirmed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'The poster has not submitted payment confirmation';
  END IF;
  IF v_gig.payment_method = 'manual'
     AND v_receipt.payment_ordered
     AND NULLIF(v_receipt.poster_receipt_url, '') IS NULL THEN
    RAISE EXCEPTION 'The poster must upload new payment proof before you confirm receipt';
  END IF;

  -- These fields are cleared only inside this transaction. The completion
  -- functions below re-lock the same receipt and perform the real settlement.
  UPDATE public.receipts
  SET disputed = FALSE,
      dispute_reason = NULL
  WHERE id = v_receipt.id;

  IF v_gig.payment_method = 'wallet' THEN
    v_already_completed := public.complete_wallet_gig_application(v_application.id);
    v_result := jsonb_build_object('already_completed', v_already_completed, 'payment_method', 'wallet');
    INSERT INTO public.notifications (user_id, title, message, type, gig_id, application_id)
    VALUES
      (v_gig.poster_id, 'Dispute Resolved',
       format('The worker confirmed completion for "%s". Wallet escrow was settled.', v_gig.title),
       'general', v_gig.id, v_application.id),
      (v_worker_id, 'Dispute Resolved',
       format('You confirmed completion for "%s". Wallet escrow was settled.', v_gig.title),
       'general', v_gig.id, v_application.id);
  ELSE
    v_result := public.complete_manual_gig_application(v_application.id);
    v_result := COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('payment_method', 'manual');
    INSERT INTO public.notifications (user_id, title, message, type, gig_id, application_id)
    VALUES
      (v_gig.poster_id, 'Dispute Resolved',
       format('The worker confirmed receiving payment for "%s".', v_gig.title),
       'general', v_gig.id, v_application.id),
      (v_worker_id, 'Dispute Resolved',
       format('You confirmed receiving payment for "%s". The completion was recorded.', v_gig.title),
       'general', v_gig.id, v_application.id);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_worker_dispute_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_worker_dispute_payment(UUID) TO authenticated;

COMMIT;
