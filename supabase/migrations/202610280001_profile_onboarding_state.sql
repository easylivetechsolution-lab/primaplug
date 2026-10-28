-- Mark existing accounts as onboarded while making onboarding explicit for
-- profiles created after this migration.
BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN;

-- Preserve every existing account's normal dashboard entry, even if an
-- optional or legacy profile field is incomplete.
UPDATE public.users
SET onboarding_completed = TRUE
WHERE onboarding_completed IS NULL;

-- New profile rows must complete onboarding. Existing rows are already true.
ALTER TABLE public.users
  ALTER COLUMN onboarding_completed SET DEFAULT FALSE,
  ALTER COLUMN onboarding_completed SET NOT NULL;

COMMIT;
