-- Referral credits remain unchanged, but referrals no longer increase the
-- public trust score. Keep trust progression tied to reviews and work quality.
BEGIN;

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

  PERFORM 1 FROM public.users WHERE id = v_referral.referrer_id FOR UPDATE;
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
      'Your referral completed their profile! You earned 5 Prima Credits.', 'general'),
    (v_user_id, '🎁 Welcome Bonus!',
      'You joined via referral and earned 5 Prima Credits!', 'general');

  RETURN jsonb_build_object('status', 'completed');
END;
$$;

REVOKE ALL ON FUNCTION public.complete_signup_referral() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_signup_referral() TO authenticated;

COMMIT;
