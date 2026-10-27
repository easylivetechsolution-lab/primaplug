-- Give each profile its first zero-balance wallet so new accounts use the
-- standard wallet screen and have a currency selected before their first fund.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_default_wallet_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_currency TEXT;
BEGIN
  v_currency := UPPER(COALESCE(NULLIF(TRIM(NEW.wallet_currency), ''), 'USD'));
  IF v_currency NOT IN ('NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP') THEN
    v_currency := 'USD';
  END IF;

  INSERT INTO public.wallets (user_id, currency, balance, held_balance)
  VALUES (NEW.id, v_currency, 0, 0)
  ON CONFLICT (user_id, currency) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_default_wallet_for_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_create_default_wallet ON public.users;
CREATE TRIGGER users_create_default_wallet
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_wallet_for_user();

-- Repair existing profiles that have never had a wallet row. Keep all current
-- wallet balances and currencies untouched.
INSERT INTO public.wallets (user_id, currency, balance, held_balance)
SELECT u.id,
       CASE
         WHEN UPPER(COALESCE(NULLIF(TRIM(u.wallet_currency), ''), 'USD'))
              IN ('NGN', 'GHS', 'KES', 'ZAR', 'USD', 'EUR', 'GBP')
           THEN UPPER(COALESCE(NULLIF(TRIM(u.wallet_currency), ''), 'USD'))
         ELSE 'USD'
       END,
       0,
       0
FROM public.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.wallets w WHERE w.user_id = u.id
)
ON CONFLICT (user_id, currency) DO NOTHING;

COMMIT;
