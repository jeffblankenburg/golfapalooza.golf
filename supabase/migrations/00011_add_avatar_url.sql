-- Add avatar_url to users table for profile photos
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url text;
