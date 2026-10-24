-- Keep newly posted gigs within the currency and payment values the app can
-- actually settle, and reject invalid pay ranges or slot counts at the DB too.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gigs_supported_currency_check' AND conrelid = 'public.gigs'::regclass) THEN
    ALTER TABLE public.gigs
      ADD CONSTRAINT gigs_supported_currency_check
      CHECK (currency IS NOT NULL AND currency IN ('NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gigs_valid_pay_range_check' AND conrelid = 'public.gigs'::regclass) THEN
    ALTER TABLE public.gigs
      ADD CONSTRAINT gigs_valid_pay_range_check
      CHECK (pay_min IS NOT NULL AND pay_min > 0 AND pay_max IS NOT NULL AND pay_max >= pay_min) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gigs_valid_slots_check' AND conrelid = 'public.gigs'::regclass) THEN
    ALTER TABLE public.gigs
      ADD CONSTRAINT gigs_valid_slots_check
      CHECK (slots IS NOT NULL AND slots BETWEEN 1 AND 10) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gigs_supported_payment_method_check' AND conrelid = 'public.gigs'::regclass) THEN
    ALTER TABLE public.gigs
      ADD CONSTRAINT gigs_supported_payment_method_check
      CHECK (payment_method IS NOT NULL AND payment_method IN ('manual', 'wallet')) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.gigs VALIDATE CONSTRAINT gigs_supported_currency_check;
ALTER TABLE public.gigs VALIDATE CONSTRAINT gigs_valid_pay_range_check;
ALTER TABLE public.gigs VALIDATE CONSTRAINT gigs_valid_slots_check;
ALTER TABLE public.gigs VALIDATE CONSTRAINT gigs_supported_payment_method_check;

COMMIT;
