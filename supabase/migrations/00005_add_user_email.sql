-- Add email field to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Add index for email lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
