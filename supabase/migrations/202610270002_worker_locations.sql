-- Store live location for accepted physical-gig applications.
BEGIN;

CREATE TABLE IF NOT EXISTS public.worker_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gig_id UUID NOT NULL REFERENCES public.gigs(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT worker_locations_gig_worker_unique UNIQUE (gig_id, worker_id)
);

CREATE INDEX IF NOT EXISTS worker_locations_active_gig_updated_idx
  ON public.worker_locations (gig_id, updated_at DESC)
  WHERE is_active = TRUE;

ALTER TABLE public.worker_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worker_locations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.worker_locations TO authenticated;

DROP POLICY IF EXISTS worker_locations_participant_read ON public.worker_locations;
CREATE POLICY worker_locations_participant_read
  ON public.worker_locations FOR SELECT TO authenticated
  USING (
    worker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.gigs g
      WHERE g.id = worker_locations.gig_id
        AND g.poster_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS worker_locations_accepted_worker_insert ON public.worker_locations;
CREATE POLICY worker_locations_accepted_worker_insert
  ON public.worker_locations FOR INSERT TO authenticated
  WITH CHECK (
    worker_id = auth.uid()
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'worker_locations'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.worker_locations;
  END IF;
END;
$$;

COMMIT;
