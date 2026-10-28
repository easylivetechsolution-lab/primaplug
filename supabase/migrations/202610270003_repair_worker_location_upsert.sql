-- Repair databases where worker_locations existed before migration 270002.
-- The live position is the only useful row per gig and worker, so retain the
-- most recent row before enforcing the key required by the app's upsert.
BEGIN;

WITH ranked_locations AS (
  SELECT ctid,
         row_number() OVER (
           PARTITION BY gig_id, worker_id
           ORDER BY updated_at DESC NULLS LAST, ctid DESC
         ) AS rn
  FROM public.worker_locations
)
DELETE FROM public.worker_locations AS locations
USING ranked_locations AS ranked
WHERE locations.ctid = ranked.ctid
  AND ranked.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.worker_locations'::regclass
      AND conname = 'worker_locations_gig_worker_unique'
      AND contype = 'u'
      AND conkey = ARRAY[
        (SELECT attnum::smallint FROM pg_attribute
         WHERE attrelid = 'public.worker_locations'::regclass AND attname = 'gig_id'),
        (SELECT attnum::smallint FROM pg_attribute
         WHERE attrelid = 'public.worker_locations'::regclass AND attname = 'worker_id')
      ]::smallint[]
  ) THEN
    ALTER TABLE public.worker_locations
      ADD CONSTRAINT worker_locations_gig_worker_unique
      UNIQUE (gig_id, worker_id);
  END IF;
END;
$$;

COMMIT;
