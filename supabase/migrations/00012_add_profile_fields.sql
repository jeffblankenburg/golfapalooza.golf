-- Add profile fields to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS occupation varchar(100);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS city varchar(100);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS state varchar(2);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS playing_since smallint;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS swings varchar(10);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS typical_shot varchar(20);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shirt_size varchar(5);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS fun_fact text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS best_shot text;
