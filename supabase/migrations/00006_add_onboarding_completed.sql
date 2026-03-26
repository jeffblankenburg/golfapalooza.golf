-- Add onboarding_completed field to users table
-- Used to track if user has completed post-registration setup
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- Set existing users as having completed onboarding (they're already active users)
UPDATE public.users SET onboarding_completed = TRUE WHERE onboarding_completed IS NULL;
