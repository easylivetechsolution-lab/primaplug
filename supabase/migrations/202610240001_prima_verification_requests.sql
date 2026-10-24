-- Add an auditable manual review flow for the public Prima verification badge.
BEGIN;

CREATE TABLE IF NOT EXISTS public.verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  applicant_note TEXT NOT NULL CHECK (char_length(trim(applicant_note)) BETWEEN 20 AND 1500),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note TEXT CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT verification_request_review_state_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS verification_requests_one_pending_per_user
  ON public.verification_requests(user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS verification_requests_status_created_idx
  ON public.verification_requests(status, created_at DESC);

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verification_requests FROM anon, PUBLIC;
GRANT SELECT, INSERT ON public.verification_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_is_verification_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT u.is_admin FROM public.users u WHERE u.id = auth.uid()), FALSE);
$$;

REVOKE ALL ON FUNCTION public.current_user_is_verification_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_verification_admin() TO authenticated;

DROP POLICY IF EXISTS verification_requests_read_own_or_admin ON public.verification_requests;
CREATE POLICY verification_requests_read_own_or_admin
  ON public.verification_requests FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_is_verification_admin()
  );

DROP POLICY IF EXISTS verification_requests_submit_own ON public.verification_requests;
CREATE POLICY verification_requests_submit_own
  ON public.verification_requests FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND review_note IS NULL
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.review_verification_request(
  p_request_id UUID,
  p_decision TEXT,
  p_review_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_user_id UUID;
BEGIN
  IF v_admin_id IS NULL OR NOT public.current_user_is_verification_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;
  IF p_review_note IS NOT NULL AND char_length(p_review_note) > 1000 THEN
    RAISE EXCEPTION 'Review note must be 1000 characters or fewer';
  END IF;

  UPDATE public.verification_requests
  SET status = p_decision,
      review_note = NULLIF(trim(p_review_note), ''),
      reviewed_by = v_admin_id,
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending'
  RETURNING user_id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Pending verification request not found';
  END IF;

  IF p_decision = 'approved' THEN
    UPDATE public.users SET is_verified = TRUE WHERE id = v_user_id;
  END IF;

  RETURN p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_verification_request(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_verification_request(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
