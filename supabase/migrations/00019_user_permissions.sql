-- Add granular permissions JSONB column to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
