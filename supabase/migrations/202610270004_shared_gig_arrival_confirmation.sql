-- Persist worker arrival and let the gig poster confirm it.
BEGIN;

ALTER TABLE public.worker_locations
  ADD COLUMN IF NOT EXISTS worker_arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS poster_confirmed_arrival_at TIMESTAMPTZ;

-- Location sharing remains opt-in and stops when the worker reports arrival.
-- Prevent direct client updates from restarting tracking after arrival or
-- writing either side's confirmation timestamp.
DROP POLICY IF EXISTS worker_locations_accepted_worker_insert ON public.worker_locations;
CREATE POLICY worker_locations_accepted_worker_insert
  ON public.worker_locations FOR INSERT TO authenticated
  WITH CHECK (
    worker_id = auth.uid()
    AND worker_arrived_at IS NULL
    AND poster_confirmed_arrival_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.gigs g ON g.id = a.gig_id
      WHERE a.gig_id = worker_locations.gig_id
        AND a.worker_id = auth.uid()
        AND a.status = 'accepted'
        AND g.type = 'physical'
    )
  );

DROP POLICY IF EXISTS worker_locations_accepted_worker_update ON public.worker_locations;
CREATE POLICY worker_locations_accepted_worker_update
  ON public.worker_locations FOR UPDATE TO authenticated
  USING (
    worker_id = auth.uid()
    AND worker_arrived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.gigs g ON g.id = a.gig_id
      WHERE a.gig_id = worker_locations.gig_id
        AND a.worker_id = auth.uid()
        AND a.status = 'accepted'
        AND g.type = 'physical'
    )
  )
  WITH CHECK (
    worker_id = auth.uid()
    AND worker_arrived_at IS NULL
    AND poster_confirmed_arrival_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.gigs g ON g.id = a.gig_id
      WHERE a.gig_id = worker_locations.gig_id
        AND a.worker_id = auth.uid()
        AND a.status = 'accepted'
        AND g.type = 'physical'
    )
  );

CREATE OR REPLACE FUNCTION public.report_gig_worker_arrival(p_gig_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_arrived_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in is required';
  END IF;

  UPDATE public.worker_locations wl
  SET is_active = FALSE,
      worker_arrived_at = COALESCE(wl.worker_arrived_at, now()),
      updated_at = now()
  WHERE wl.gig_id = p_gig_id
    AND wl.worker_id = auth.uid()
    AND wl.is_active = TRUE
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      JOIN public.gigs g ON g.id = a.gig_id
      WHERE a.gig_id = wl.gig_id
        AND a.worker_id = auth.uid()
        AND a.status = 'accepted'
        AND g.type = 'physical'
    )
  RETURNING wl.worker_arrived_at INTO v_arrived_at;

  IF v_arrived_at IS NULL THEN
    RAISE EXCEPTION 'Start navigation before reporting arrival';
  END IF;

  RETURN v_arrived_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_gig_worker_arrival(
  p_gig_id UUID,
  p_worker_id UUID
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_confirmed_at TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR p_worker_id IS NULL THEN
    RAISE EXCEPTION 'Poster sign-in and worker are required';
  END IF;

  UPDATE public.worker_locations wl
  SET poster_confirmed_arrival_at = COALESCE(wl.poster_confirmed_arrival_at, now())
  WHERE wl.gig_id = p_gig_id
    AND wl.worker_id = p_worker_id
    AND wl.worker_arrived_at IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.gigs g
      JOIN public.applications a ON a.gig_id = g.id
      WHERE g.id = wl.gig_id
        AND g.poster_id = auth.uid()
        AND g.type = 'physical'
        AND a.worker_id = wl.worker_id
        AND a.status IN ('accepted', 'completed')
    )
  RETURNING wl.poster_confirmed_arrival_at INTO v_confirmed_at;

  IF v_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Worker arrival has not been reported for this gig';
  END IF;

  RETURN v_confirmed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.report_gig_worker_arrival(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_gig_worker_arrival(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_gig_worker_arrival(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_gig_worker_arrival(UUID, UUID) TO authenticated;

-- Stop any active location share when the accepted application leaves the
-- accepted state (for example, when the gig is completed or cancelled).
CREATE OR REPLACE FUNCTION public.stop_worker_location_when_application_ends()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status = 'accepted' AND NEW.status <> 'accepted' THEN
    UPDATE public.worker_locations
    SET is_active = FALSE, updated_at = now()
    WHERE gig_id = NEW.gig_id
      AND worker_id = NEW.worker_id
      AND is_active = TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS applications_stop_worker_location ON public.applications;
CREATE TRIGGER applications_stop_worker_location
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW
  EXECUTE FUNCTION public.stop_worker_location_when_application_ends();

REVOKE ALL ON FUNCTION public.stop_worker_location_when_application_ends() FROM PUBLIC, anon, authenticated;

COMMIT;
