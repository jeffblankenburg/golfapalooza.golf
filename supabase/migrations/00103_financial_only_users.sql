-- ===========================================
-- Financial-Only Users
-- Allow users to exist without a phone number
-- for financial contest tracking only.
-- ===========================================

-- 1. Add is_financial_only flag
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_financial_only BOOLEAN NOT NULL DEFAULT false;

-- 2. Make phone nullable
ALTER TABLE public.users
  ALTER COLUMN phone DROP NOT NULL;

-- 3. Replace unique constraint with partial unique index
--    (allows multiple NULL phones, but real phones must be unique)
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON public.users(phone)
  WHERE phone IS NOT NULL;
