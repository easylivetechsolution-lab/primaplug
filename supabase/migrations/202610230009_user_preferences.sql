-- Keep user-facing preferences in a table with per-user row security rather
-- than adding more mutable settings to the currently exposed users table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  language TEXT NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'fr', 'es', 'pt', 'ar', 'zh', 'hi', 'de')),
  preferred_currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (preferred_currency ~ '^[A-Z]{3}$'),
  notification_preferences JSONB NOT NULL DEFAULT '{"applications":true,"statusUpdates":true,"messages":true,"receipts":true,"reviews":true,"newGigs":true,"sounds":true}'::JSONB
    CHECK (jsonb_typeof(notification_preferences) = 'object'),
  privacy_preferences JSONB NOT NULL DEFAULT '{"location":true,"phone":true,"profile":true}'::JSONB
    CHECK (jsonb_typeof(privacy_preferences) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.user_preferences (user_id, language, preferred_currency)
SELECT u.id,
  CASE WHEN u.language IN ('en', 'fr', 'es', 'pt', 'ar', 'zh', 'hi', 'de')
    THEN u.language ELSE 'en' END,
  CASE WHEN upper(coalesce(nullif(trim(u.preferred_currency), ''), 'USD')) ~ '^[A-Z]{3}$'
    THEN upper(coalesce(nullif(trim(u.preferred_currency), ''), 'USD')) ELSE 'USD' END
FROM public.users u
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_preferences TO authenticated;

DROP POLICY IF EXISTS user_preferences_read_own ON public.user_preferences;
CREATE POLICY user_preferences_read_own ON public.user_preferences
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_preferences_insert_own ON public.user_preferences;
CREATE POLICY user_preferences_insert_own ON public.user_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_preferences_update_own ON public.user_preferences;
CREATE POLICY user_preferences_update_own ON public.user_preferences
  FOR UPDATE TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
