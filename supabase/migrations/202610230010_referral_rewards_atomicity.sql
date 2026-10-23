-- Make signup referral rewards atomic and record referral attribution through
-- authenticated functions instead of letting clients edit reward state.
BEGIN;

DROP POLICY IF EXISTS "Referred users create own referral" ON public.referrals;
DROP POLICY IF EXISTS "Referred users complete own referral" ON public.referrals;
DROP POLICY IF EXISTS "Workers create own gig referral" ON public.gig_referrals;
DROP POLICY IF EXISTS "Gig participants complete referral payout" ON public.gig_referrals;

REVOKE INSERT, UPDATE, DELETE ON public.referrals FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.gig_referrals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.referrals, public.gig_referrals TO authenticated;

CREATE OR REPLACE FUNCTION public.record_signup_referral(p_referral_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_referrer_id UUID;
  v_inserted_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT id INTO v_referrer_id
  FROM public.users
  WHERE referral_code = NULLIF(trim(p_referral_code), '');
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;
  IF v_referrer_id = v_user_id THEN
    RETURN jsonb_build_object('status', 'self_referral');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code, status)
  VALUES (v_referrer_id, v_user_id, trim(p_referral_code), 'pending')
  ON CONFLICT (referred_id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('status', 'already_attributed');
  END IF;
  RETURN jsonb_build_object('status', 'attributed');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_referral_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_code TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_code IS NULL OR p_code !~ '^[a-z0-9]{4,32}$' THEN
    RAISE EXCEPTION 'Invalid referral code format';
  END IF;

  SELECT referral_code INTO v_existing_code
  FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'profile_not_found'); END IF;
  IF v_existing_code IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'referral_code', v_existing_code);
  END IF;

  BEGIN
    UPDATE public.users SET referral_code = p_code
    WHERE id = v_user_id AND referral_code IS NULL;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'collision');
  END;
  RETURN jsonb_build_object('status', 'created', 'referral_code', p_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_signup_referral()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_referral public.referrals%ROWTYPE;
  v_profile public.users%ROWTYPE;
  v_profile_fields INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_profile FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'profile_not_found'); END IF;

  v_profile_fields :=
    (CASE WHEN NULLIF(trim(v_profile.full_name), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(trim(v_profile.avatar_url), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(trim(v_profile.location), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN COALESCE(array_length(v_profile.skills, 1), 0) > 0 THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(trim(v_profile.phone), '') IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN NULLIF(trim(v_profile.bio), '') IS NOT NULL THEN 1 ELSE 0 END);
  IF v_profile_fields < 5 THEN
    RETURN jsonb_build_object('status', 'profile_incomplete');
  END IF;

  SELECT * INTO v_referral
  FROM public.referrals
  WHERE referred_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_referred'); END IF;
  IF v_referral.reward_given OR v_referral.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'already_completed');
  END IF;
  IF v_referral.status <> 'pending' OR v_referral.referrer_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_eligible');
  END IF;

  UPDATE public.users
  SET trust_score = LEAST(100, COALESCE(trust_score, 0) + 2)
  WHERE id = v_referral.referrer_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'referrer_unavailable'); END IF;

  INSERT INTO public.prima_credits (user_id, balance, lifetime_earned)
  VALUES (v_referral.referrer_id, 5, 5)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = COALESCE(prima_credits.balance, 0) + 5,
      lifetime_earned = COALESCE(prima_credits.lifetime_earned, 0) + 5,
      updated_at = now();
  UPDATE public.users
  SET credits_balance = COALESCE(credits_balance, 0) + 5
  WHERE id = v_referral.referrer_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, description, gig_id)
  VALUES (v_referral.referrer_id, 5, 'referral_reward',
    'Referral reward — your referral joined Prima', NULL);

  INSERT INTO public.prima_credits (user_id, balance, lifetime_earned)
  VALUES (v_user_id, 5, 5)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = COALESCE(prima_credits.balance, 0) + 5,
      lifetime_earned = COALESCE(prima_credits.lifetime_earned, 0) + 5,
      updated_at = now();
  UPDATE public.users
  SET credits_balance = COALESCE(credits_balance, 0) + 5
  WHERE id = v_user_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, description, gig_id)
  VALUES (v_user_id, 5, 'referral_joined',
    'Welcome bonus for joining via referral', NULL);

  UPDATE public.referrals
  SET status = 'completed', reward_given = true, completed_at = now()
  WHERE id = v_referral.id;

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES
    (v_referral.referrer_id, '🎉 Referral Completed!',
      'Your referral completed their profile! You earned +2 trust score and 5 Prima Credits.', 'general'),
    (v_user_id, '🎁 Welcome Bonus!',
      'You joined via referral and earned 5 Prima Credits!', 'general');

  RETURN jsonb_build_object('status', 'completed');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_gig_referral(
  p_gig_id UUID,
  p_referral_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_referrer_id UUID;
  v_inserted_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.applications
    WHERE gig_id = p_gig_id AND worker_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('status', 'application_not_found');
  END IF;

  SELECT id INTO v_referrer_id
  FROM public.users
  WHERE referral_code = NULLIF(trim(p_referral_code), '');
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;
  IF v_referrer_id = v_user_id THEN
    RETURN jsonb_build_object('status', 'self_referral');
  END IF;

  INSERT INTO public.gig_referrals (gig_id, referrer_id, referred_id, status)
  VALUES (p_gig_id, v_referrer_id, v_user_id, 'pending')
  ON CONFLICT (gig_id, referred_id) DO NOTHING
  RETURNING id INTO v_inserted_id;
  RETURN jsonb_build_object(
    'status', CASE WHEN v_inserted_id IS NULL THEN 'already_tracked' ELSE 'tracked' END
  );
END;
$$;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS trust_applied_at TIMESTAMPTZ;

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
  v_worker_id UUID;
  v_delta INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_review
  FROM public.reviews
  WHERE id = p_review_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'review_not_found'); END IF;
  SELECT poster_id, worker_id
  INTO v_poster_id, v_worker_id
  FROM public.gigs
  WHERE id = v_review.gig_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'gig_not_found'); END IF;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND v_review.reviewer_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only the review author can apply its trust change';
  END IF;
  IF v_review.type <> 'worker' OR v_poster_id IS DISTINCT FROM v_review.reviewer_id
     OR v_worker_id IS DISTINCT FROM v_review.reviewee_id THEN
    RAISE EXCEPTION 'Review is not a valid worker review for this gig';
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
  END IF;
  UPDATE public.reviews SET trust_applied_at = now() WHERE id = v_review.id;
  RETURN jsonb_build_object('status', 'applied', 'trust_change', v_delta);
END;
$$;

REVOKE ALL ON FUNCTION public.record_signup_referral(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_my_referral_code(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_signup_referral() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_gig_referral(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_review_trust(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_signup_referral(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_referral_code(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_signup_referral() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_gig_referral(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_review_trust(UUID) TO authenticated, service_role;

-- Keep credit ledgers readable by their owner while preventing direct balance
-- inserts/updates/deletes through the REST API. Trusted functions write them.
ALTER TABLE public.prima_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prima_credits, public.credit_transactions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prima_credits, public.credit_transactions TO authenticated;
GRANT ALL ON public.prima_credits, public.credit_transactions TO service_role;

DROP POLICY IF EXISTS prima_credits_read_own ON public.prima_credits;
CREATE POLICY prima_credits_read_own ON public.prima_credits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS credit_transactions_read_own ON public.credit_transactions;
CREATE POLICY credit_transactions_read_own ON public.credit_transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.guard_user_financial_balances()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin')
     OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Users may only create their own profile';
    END IF;
    NEW.credits_balance := 0;
    NEW.wallet_balance := 0;
    NEW.held_balance := 0;
    NEW.commission_balance := 0;
    NEW.trust_score := 0;
    NEW.is_admin := false;
    NEW.is_banned := false;
    NEW.is_verified := false;
    NEW.referral_code := NULL;
    RETURN NEW;
  END IF;

  IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance
     OR NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
     OR NEW.held_balance IS DISTINCT FROM OLD.held_balance
     OR NEW.commission_balance IS DISTINCT FROM OLD.commission_balance
     OR NEW.trust_score IS DISTINCT FROM OLD.trust_score
     OR NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
     OR NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'Financial balances, trust scores, account controls, and referral codes require trusted operations';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_financial_balances ON public.users;
CREATE TRIGGER guard_user_financial_balances
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_financial_balances();
REVOKE ALL ON FUNCTION public.guard_user_financial_balances() FROM PUBLIC;

-- Keep legacy general-purpose credit grants for service-role/admin workflows,
-- but prevent public/anonymous use and reject non-admin browser callers.
CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_type TEXT,
  p_description TEXT,
  p_gig_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Administrator or service role required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Credit amount must be positive'; END IF;

  INSERT INTO public.prima_credits (user_id, balance, lifetime_earned)
  VALUES (p_user_id, p_amount, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET balance = COALESCE(prima_credits.balance, 0) + EXCLUDED.balance,
      lifetime_earned = COALESCE(prima_credits.lifetime_earned, 0) + EXCLUDED.lifetime_earned,
      updated_at = now();
  UPDATE public.users
  SET credits_balance = COALESCE(credits_balance, 0) + p_amount
  WHERE id = p_user_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, description, gig_id)
  VALUES (p_user_id, p_amount, p_type, p_description, p_gig_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_trust(user_id UUID, amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Administrator or service role required';
  END IF;
  IF $2 IS NULL OR $2 = 0 THEN RETURN; END IF;
  UPDATE public.users
  SET trust_score = GREATEST(0, LEAST(100, COALESCE(trust_score, 0) + $2))
  WHERE id = $1;
END;
$$;

REVOKE ALL ON FUNCTION public.add_credits(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, NUMERIC) TO service_role;
REVOKE ALL ON FUNCTION public.add_credits(UUID, NUMERIC, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, NUMERIC, TEXT, TEXT, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.increment_trust(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_trust(UUID, INTEGER) TO authenticated, service_role;

COMMIT;
