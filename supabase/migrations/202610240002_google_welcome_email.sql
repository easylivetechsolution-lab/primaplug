-- Track Google welcome email delivery so repeated OAuth callbacks do not send
-- duplicate messages. Only the trusted Edge Function service role can access it.
BEGIN;

CREATE TABLE IF NOT EXISTS public.google_welcome_email_deliveries (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

ALTER TABLE public.google_welcome_email_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_welcome_email_deliveries FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_google_welcome_email(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_claimed BOOLEAN := FALSE;
BEGIN
  INSERT INTO public.google_welcome_email_deliveries (user_id, status, updated_at, sent_at)
  VALUES (p_user_id, 'sending', now(), NULL)
  ON CONFLICT (user_id) DO UPDATE
    SET status = 'sending', updated_at = now(), sent_at = NULL
    WHERE public.google_welcome_email_deliveries.status = 'failed'
       OR (
         public.google_welcome_email_deliveries.status = 'sending'
         AND public.google_welcome_email_deliveries.updated_at < now() - INTERVAL '10 minutes'
       )
  RETURNING TRUE INTO v_claimed;

  RETURN COALESCE(v_claimed, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_google_welcome_email(
  p_user_id UUID,
  p_sent BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated BOOLEAN := FALSE;
BEGIN
  UPDATE public.google_welcome_email_deliveries
  SET status = CASE WHEN p_sent THEN 'sent' ELSE 'failed' END,
      updated_at = now(),
      sent_at = CASE WHEN p_sent THEN now() ELSE NULL END
  WHERE user_id = p_user_id AND status = 'sending';

  v_updated := FOUND;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_google_welcome_email(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_google_welcome_email(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_google_welcome_email(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_google_welcome_email(UUID, BOOLEAN) TO service_role;

COMMIT;
