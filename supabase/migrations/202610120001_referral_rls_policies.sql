-- Referral write policies
-- The app records referral attribution from the signed-in user's browser.
-- Existing migrations enabled RLS and added read policies, but without write
-- policies new referral rows and payout completion updates can be blocked.

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gig_referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referrals'
      AND policyname = 'Referred users create own referral'
  ) THEN
    CREATE POLICY "Referred users create own referral" ON public.referrals
      FOR INSERT
      WITH CHECK (auth.uid() = referred_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'referrals'
      AND policyname = 'Referred users complete own referral'
  ) THEN
    CREATE POLICY "Referred users complete own referral" ON public.referrals
      FOR UPDATE
      USING (auth.uid() = referred_id)
      WITH CHECK (auth.uid() = referred_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gig_referrals'
      AND policyname = 'Workers create own gig referral'
  ) THEN
    CREATE POLICY "Workers create own gig referral" ON public.gig_referrals
      FOR INSERT
      WITH CHECK (auth.uid() = referred_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'gig_referrals'
      AND policyname = 'Gig participants complete referral payout'
  ) THEN
    CREATE POLICY "Gig participants complete referral payout" ON public.gig_referrals
      FOR UPDATE
      USING (
        auth.uid() = referred_id
        OR auth.uid() = referrer_id
        OR EXISTS (
          SELECT 1
          FROM public.gigs
          WHERE gigs.id = gig_referrals.gig_id
            AND (gigs.poster_id = auth.uid() OR gigs.worker_id = auth.uid())
        )
      )
      WITH CHECK (
        auth.uid() = referred_id
        OR auth.uid() = referrer_id
        OR EXISTS (
          SELECT 1
          FROM public.gigs
          WHERE gigs.id = gig_referrals.gig_id
            AND (gigs.poster_id = auth.uid() OR gigs.worker_id = auth.uid())
        )
      );
  END IF;
END $$;
