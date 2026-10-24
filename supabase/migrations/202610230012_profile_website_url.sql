-- Store a user's personal website separately from portfolio and social links.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS website_url TEXT;
