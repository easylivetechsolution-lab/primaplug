-- Services: boost, reviews, saved, location, infinite scroll
-- Adds: boost_plans, service_reviews, saved_services tables
-- Alters: services (featured cols, location, avg_rating, review_count)
-- Alters: wallet_transactions (service_id)

-- ── 1. Extend services table ─────────────────────────────────────────────────

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_featured    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location       TEXT,
  ADD COLUMN IF NOT EXISTS avg_rating     NUMERIC(3,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count   INT          NOT NULL DEFAULT 0;

-- Index for fast featured query
CREATE INDEX IF NOT EXISTS services_featured_idx
  ON public.services (is_featured, featured_until)
  WHERE is_featured = true;

CREATE INDEX IF NOT EXISTS services_created_at_idx
  ON public.services (created_at DESC);

CREATE INDEX IF NOT EXISTS services_avg_rating_idx
  ON public.services (avg_rating DESC);

-- ── 2. Add service_id to wallet_transactions ─────────────────────────────────

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES public.services(id) ON DELETE SET NULL;

-- ── 3. Boost plans table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.boost_plans (
  id        UUID     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  days      INT      NOT NULL UNIQUE,
  label     TEXT     NOT NULL,
  price_ngn NUMERIC  NOT NULL,
  price_usd NUMERIC  NOT NULL,
  price_ghs NUMERIC  NOT NULL DEFAULT 0,
  price_kes NUMERIC  NOT NULL DEFAULT 0
);

-- Seed default plans (idempotent)
INSERT INTO public.boost_plans (days, label, price_ngn, price_usd, price_ghs, price_kes) VALUES
  (7,  '7 Days',  1500, 1.00, 15, 130),
  (14, '14 Days', 2500, 2.00, 25, 220),
  (30, '30 Days', 4000, 3.00, 40, 350)
ON CONFLICT (days) DO UPDATE SET
  label     = EXCLUDED.label,
  price_ngn = EXCLUDED.price_ngn,
  price_usd = EXCLUDED.price_usd,
  price_ghs = EXCLUDED.price_ghs,
  price_kes = EXCLUDED.price_kes;

-- ── 4. Service reviews table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.service_reviews (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_id  UUID        NOT NULL REFERENCES public.services(id)  ON DELETE CASCADE,
  reviewer_id UUID        NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  rating      SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS service_reviews_service_idx  ON public.service_reviews (service_id);
CREATE INDEX IF NOT EXISTS service_reviews_reviewer_idx ON public.service_reviews (reviewer_id);

-- RLS
ALTER TABLE public.service_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read service reviews"  ON public.service_reviews;
DROP POLICY IF EXISTS "Users manage own service reviews" ON public.service_reviews;

CREATE POLICY "Anyone can read service reviews"
  ON public.service_reviews FOR SELECT USING (true);

CREATE POLICY "Users manage own service reviews"
  ON public.service_reviews FOR ALL
  USING (reviewer_id = auth.uid())
  WITH CHECK (reviewer_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _service_reviews_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS service_reviews_set_updated_at ON public.service_reviews;
CREATE TRIGGER service_reviews_set_updated_at
  BEFORE UPDATE ON public.service_reviews
  FOR EACH ROW EXECUTE FUNCTION _service_reviews_set_updated_at();

-- ── 5. Saved services table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.saved_services (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES public.users(id)     ON DELETE CASCADE,
  service_id UUID        NOT NULL REFERENCES public.services(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_id)
);

CREATE INDEX IF NOT EXISTS saved_services_user_idx ON public.saved_services (user_id);

ALTER TABLE public.saved_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved services" ON public.saved_services;

CREATE POLICY "Users manage own saved services"
  ON public.saved_services FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 6. RPC: submit_service_review ────────────────────────────────────────────
-- Security definer so it can recalculate avg_rating on the services row.

CREATE OR REPLACE FUNCTION public.submit_service_review(
  p_service_id UUID,
  p_rating     SMALLINT,
  p_comment    TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id      UUID := auth.uid();
  v_worker_id      UUID;
  v_review_id      UUID;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT worker_id INTO v_worker_id FROM public.services WHERE id = p_service_id;
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION 'Service not found';
  END IF;
  IF v_worker_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot review your own service';
  END IF;

  INSERT INTO public.service_reviews (service_id, reviewer_id, rating, comment)
  VALUES (p_service_id, v_caller_id, p_rating, p_comment)
  ON CONFLICT (service_id, reviewer_id) DO UPDATE
    SET rating = EXCLUDED.rating,
        comment = EXCLUDED.comment,
        updated_at = now()
  RETURNING id INTO v_review_id;

  -- Recalculate aggregate on services row
  UPDATE public.services
  SET
    avg_rating   = (SELECT ROUND(AVG(rating)::NUMERIC, 2) FROM public.service_reviews WHERE service_id = p_service_id),
    review_count = (SELECT COUNT(*)                        FROM public.service_reviews WHERE service_id = p_service_id)
  WHERE id = p_service_id;

  RETURN v_review_id;
END;
$$;

-- ── 7. RPC: activate_service_boost (wallet payment path) ─────────────────────
-- Debits the caller's wallet and activates the boost atomically.

CREATE OR REPLACE FUNCTION public.activate_service_boost(
  p_service_id UUID,
  p_days       INT,
  p_currency   TEXT DEFAULT 'NGN'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id  UUID    := auth.uid();
  v_worker_id  UUID;
  v_price      NUMERIC;
  v_deducted   NUMERIC;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller owns the service
  SELECT worker_id INTO v_worker_id FROM public.services WHERE id = p_service_id;
  IF v_worker_id IS NULL  THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF v_worker_id != v_caller_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Get price for currency
  SELECT CASE p_currency
    WHEN 'NGN' THEN price_ngn
    WHEN 'USD' THEN price_usd
    WHEN 'GHS' THEN price_ghs
    WHEN 'KES' THEN price_kes
    ELSE price_ngn
  END
  INTO v_price
  FROM public.boost_plans
  WHERE days = p_days;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Invalid boost plan: % days', p_days;
  END IF;

  -- Atomic wallet debit (returns NULL if insufficient balance)
  v_deducted := _debit_wallet(v_caller_id, p_currency, v_price);
  IF v_deducted IS NULL THEN
    RAISE EXCEPTION 'Insufficient % wallet balance', p_currency;
  END IF;

  -- Extend or set featured_until (stacks on top of existing unexpired boost)
  UPDATE public.services
  SET
    is_featured    = true,
    featured_until = GREATEST(COALESCE(featured_until, now()), now()) + (p_days || ' days')::INTERVAL
  WHERE id = p_service_id;

  -- Audit record
  INSERT INTO public.wallet_transactions
    (user_id, service_id, type, amount, currency, status, description)
  VALUES
    (v_caller_id, p_service_id, 'boost', v_price, p_currency, 'completed',
     format('Service boost — %s days', p_days));

  RETURN true;
END;
$$;

-- ── 8. RPC: expire_featured_services ─────────────────────────────────────────
-- Call this via pg_cron or Supabase cron edge function daily.
-- admin-featured rows (featured_until IS NULL) are never expired.

CREATE OR REPLACE FUNCTION public.expire_featured_services()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.services
  SET is_featured = false
  WHERE is_featured = true
    AND featured_until IS NOT NULL
    AND featured_until < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── 9. RLS on boost_plans (read-only for everyone) ──────────────────────────

ALTER TABLE public.boost_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read boost plans" ON public.boost_plans;

CREATE POLICY "Anyone can read boost plans"
  ON public.boost_plans FOR SELECT USING (true);
