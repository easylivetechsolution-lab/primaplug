-- Align referral/review RPC assumptions with the live schema. Historical
-- duplicate reviews remain intact; new reviews get one trust application.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.gig_referrals
    WHERE gig_id IS NOT NULL AND referred_id IS NOT NULL
    GROUP BY gig_id, referred_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate gig referral pairs exist; review them before adding the unique index';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS gig_referrals_gig_referred_unique
  ON public.gig_referrals(gig_id, referred_id);

-- The live database already contains duplicate review pairs, so keep those
-- legacy rows out of the new uniqueness rule while protecting future inserts.
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS trust_application_eligible BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_review_trust_application()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.trust_application_eligible := true;
    NEW.trust_applied_at := NULL;
    RETURN NEW;
  END IF;

  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.trust_application_eligible IS DISTINCT FROM OLD.trust_application_eligible
     OR NEW.trust_applied_at IS DISTINCT FROM OLD.trust_applied_at THEN
    RAISE EXCEPTION 'Review trust state can only be changed by trusted operations';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_review_trust_application ON public.reviews;
CREATE TRIGGER guard_review_trust_application
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.guard_review_trust_application();
REVOKE ALL ON FUNCTION public.guard_review_trust_application() FROM PUBLIC;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_eligible_review_per_gig
  ON public.reviews(gig_id, reviewer_id, reviewee_id, type)
  WHERE trust_application_eligible
    AND gig_id IS NOT NULL AND reviewer_id IS NOT NULL AND reviewee_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_review_trust(p_review_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_review public.reviews%ROWTYPE;
  v_poster_id UUID;
  v_delta INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_review
  FROM public.reviews
  WHERE id = p_review_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'review_not_found'); END IF;
  IF NOT v_review.trust_application_eligible THEN
    RETURN jsonb_build_object('status', 'legacy_review');
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND v_review.reviewer_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only the review author can apply its trust change';
  END IF;
  IF v_review.type IS DISTINCT FROM 'worker'
     OR v_review.rating IS NULL OR v_review.rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Review is not a valid worker rating';
  END IF;

  SELECT g.poster_id INTO v_poster_id
  FROM public.gigs g
  WHERE g.id = v_review.gig_id
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.gig_id = g.id
        AND a.worker_id = v_review.reviewee_id
        AND a.status IN ('accepted', 'completed')
    );
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'accepted_application_not_found');
  END IF;
  IF v_poster_id IS DISTINCT FROM v_review.reviewer_id THEN
    RAISE EXCEPTION 'Only the gig poster can review this worker';
  END IF;
  IF v_review.trust_applied_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_applied');
  END IF;

  v_delta := CASE WHEN v_review.rating >= 4 THEN 2
                  WHEN v_review.rating >= 3 THEN 0 ELSE -3 END;
  IF v_delta <> 0 THEN
    UPDATE public.users
    SET trust_score = GREATEST(0, LEAST(100, COALESCE(trust_score, 0) + v_delta))
    WHERE id = v_review.reviewee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review recipient profile not found'; END IF;
  END IF;

  UPDATE public.reviews SET trust_applied_at = now() WHERE id = v_review.id;
  RETURN jsonb_build_object('status', 'applied', 'trust_change', v_delta);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_review_trust(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_review_trust(UUID) TO authenticated, service_role;

COMMIT;
