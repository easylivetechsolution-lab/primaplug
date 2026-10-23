-- Prevent either participant from writing the other participant's receipt
-- confirmation or completion fields through the REST table endpoint.
-- SECURITY DEFINER completion/admin functions continue to perform their
-- approved updates as the database owner.

CREATE OR REPLACE FUNCTION public.guard_receipt_participant_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_is_admin BOOLEAN := false;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR COALESCE(auth.role(), '') = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authenticated user required';
  END IF;

  v_is_admin := public.current_user_is_receipt_admin();
  IF COALESCE(v_is_admin, false) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Only an administrator can delete receipts';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.poster_id <> v_actor THEN
      RAISE EXCEPTION 'Only the gig poster can submit this receipt';
    END IF;
    IF NEW.application_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.applications a
      JOIN public.gigs g ON g.id = a.gig_id
      WHERE a.id = NEW.application_id
        AND a.gig_id = NEW.gig_id
        AND a.worker_id = NEW.worker_id
        AND g.poster_id = v_actor
        AND a.status IN ('accepted', 'completed')
    ) THEN
      RAISE EXCEPTION 'Receipt must match an accepted application posted by this user';
    END IF;
    IF COALESCE(NEW.worker_confirmed, false)
       OR COALESCE(NEW.disputed, false)
       OR COALESCE(NEW.completed, false)
       OR NEW.status = 'completed'
       OR NEW.worker_confirmed_at IS NOT NULL
       OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Receipt cannot be inserted with worker or completion confirmation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.gig_id IS DISTINCT FROM OLD.gig_id
     OR NEW.application_id IS DISTINCT FROM OLD.application_id
     OR NEW.poster_id IS DISTINCT FROM OLD.poster_id
     OR NEW.worker_id IS DISTINCT FROM OLD.worker_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Receipt ownership and job references cannot be changed';
  END IF;

  IF OLD.poster_id = v_actor THEN
    IF NEW.worker_confirmed IS DISTINCT FROM OLD.worker_confirmed
       OR NEW.worker_confirmed_at IS DISTINCT FROM OLD.worker_confirmed_at
       OR NEW.disputed IS DISTINCT FROM OLD.disputed
       OR NEW.dispute_reason IS DISTINCT FROM OLD.dispute_reason
       OR NEW.completed IS DISTINCT FROM OLD.completed
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
       OR NEW.worker_receipt_url IS DISTINCT FROM OLD.worker_receipt_url THEN
      RAISE EXCEPTION 'Poster cannot change worker confirmation or completion fields';
    END IF;
    IF OLD.completed OR OLD.disputed THEN
      RAISE EXCEPTION 'Completed or disputed receipts require admin resolution';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.worker_id = v_actor THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
       OR NEW.poster_confirmed IS DISTINCT FROM OLD.poster_confirmed
       OR NEW.poster_confirmed_at IS DISTINCT FROM OLD.poster_confirmed_at
       OR NEW.poster_receipt_url IS DISTINCT FROM OLD.poster_receipt_url
       OR NEW.worker_receipt_url IS DISTINCT FROM OLD.worker_receipt_url
       OR NEW.completed IS DISTINCT FROM OLD.completed
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.worker_confirmed IS DISTINCT FROM OLD.worker_confirmed
       OR NEW.worker_confirmed_at IS DISTINCT FROM OLD.worker_confirmed_at THEN
      RAISE EXCEPTION 'Worker must use the completion function to confirm work';
    END IF;
    IF OLD.completed THEN
      RAISE EXCEPTION 'Completed receipts cannot be changed by the worker';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only the gig participants or an administrator can change this receipt';
END;
$$;

DROP TRIGGER IF EXISTS guard_receipt_participant_updates ON public.receipts;
CREATE TRIGGER guard_receipt_participant_updates
  BEFORE INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_receipt_participant_updates();

REVOKE ALL ON FUNCTION public.guard_receipt_participant_updates() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.current_user_is_receipt_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT u.is_admin FROM public.users u WHERE u.id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_receipt_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_receipt_admin() TO authenticated;

-- Replace legacy receipt policies so old broad policies cannot override the
-- participant-only rules below. The trigger above restricts updateable fields.
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'receipts'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.receipts', v_policy.policyname);
  END LOOP;
END;
$$;

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipts_participant_read ON public.receipts
  FOR SELECT TO authenticated
  USING (auth.uid() = poster_id OR auth.uid() = worker_id
    OR public.current_user_is_receipt_admin());

CREATE POLICY receipts_poster_insert ON public.receipts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = poster_id OR public.current_user_is_receipt_admin());

CREATE POLICY receipts_participant_update ON public.receipts
  FOR UPDATE TO authenticated
  USING (auth.uid() = poster_id OR auth.uid() = worker_id
    OR public.current_user_is_receipt_admin())
  WITH CHECK (auth.uid() = poster_id OR auth.uid() = worker_id
    OR public.current_user_is_receipt_admin());

CREATE POLICY receipts_admin_delete ON public.receipts
  FOR DELETE TO authenticated
  USING (public.current_user_is_receipt_admin());
