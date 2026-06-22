-- Add wallet_currency column — new users default to USD, existing funded users keep NGN (implicit before)
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_currency VARCHAR(3) DEFAULT 'USD';

UPDATE users
SET wallet_currency = 'NGN'
WHERE wallet_balance > 0
  AND (wallet_currency IS NULL OR wallet_currency = 'USD');
