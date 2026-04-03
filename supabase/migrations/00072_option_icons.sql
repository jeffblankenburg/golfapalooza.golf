-- Add icon field to option_groups and trip_options
ALTER TABLE public.option_groups ADD COLUMN IF NOT EXISTS icon VARCHAR(50);
ALTER TABLE public.trip_options ADD COLUMN IF NOT EXISTS icon VARCHAR(50);
