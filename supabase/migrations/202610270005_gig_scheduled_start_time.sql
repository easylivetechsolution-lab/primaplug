-- Store the local-time choice for gigs marked Scheduled as an absolute instant.
BEGIN;

ALTER TABLE public.gigs
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMPTZ;

COMMIT;
