-- A manual-payment dispute ruling orders payment; it does not itself confirm
-- that payment was received. Keep the order pending until the worker confirms.
BEGIN;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS payment_ordered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_order_original_receipt_url TEXT;

CREATE OR REPLACE FUNCTION public.guard_ordered_receipt_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.payment_ordered THEN
    v_admin := public.current_user_is_receipt_admin();
    IF NOT COALESCE(v_admin, false)
       AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin')
       AND COALESCE(auth.role(), '') <> 'service_role' THEN
      IF NEW.payment_ordered IS DISTINCT FROM OLD.payment_ordered
         OR NEW.payment_deadline IS DISTINCT FROM OLD.payment_deadline
         OR NEW.payment_ordered_at IS DISTINCT FROM OLD.payment_ordered_at
         OR NEW.payment_order_original_receipt_url IS DISTINCT FROM OLD.payment_order_original_receipt_url
         OR NEW.amount IS DISTINCT FROM OLD.amount
         OR NEW.currency IS DISTINCT FROM OLD.currency THEN
        RAISE EXCEPTION 'Only an administrator can change an active payment order or its amount';
      END IF;
      IF NEW.poster_confirmed AND NULLIF(NEW.poster_receipt_url, '') IS NULL THEN
        RAISE EXCEPTION 'Upload new payment proof before confirming an ordered payment';
      END IF;
    END IF;
  END IF;

  -- Once the worker confirms receipt, stop the unpaid-order cron from acting
  -- on this receipt. Keep the order timestamp and old proof URL as an audit.
  IF NEW.completed AND NEW.worker_confirmed THEN
    NEW.payment_ordered := false;
    NEW.payment_deadline := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ordered_receipt_payment ON public.receipts;
CREATE TRIGGER guard_ordered_receipt_payment
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_ordered_receipt_payment();
REVOKE ALL ON FUNCTION public.guard_ordered_receipt_payment() FROM PUBLIC;

-- Only ban for an expired order when the poster has not submitted proof and
-- the worker has not disputed the new receipt for admin review.
DO $$
DECLARE
  v_job RECORD;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job
    WHERE jobname = 'auto-ban-payment-defaulters'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'auto-ban-payment-defaulters',
    '5 0 * * *',
    $job$
      UPDATE public.users u
      SET is_banned = true
      WHERE u.is_banned = false
        AND u.is_admin = false
        AND EXISTS (
          SELECT 1 FROM public.receipts r
          WHERE r.poster_id = u.id
            AND r.payment_ordered = true
            AND r.payment_deadline < now()
            AND r.completed = false
            AND r.poster_confirmed = false
            AND r.disputed = false
        );
    $job$
  );
END;
$$;

COMMIT;
