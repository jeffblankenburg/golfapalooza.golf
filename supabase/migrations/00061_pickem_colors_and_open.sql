-- Add team colors to pickem_games and is_open to pickem_settings
-- (These were added after 00060 was already applied)

ALTER TABLE public.pickem_games ADD COLUMN IF NOT EXISTS away_color TEXT;
ALTER TABLE public.pickem_games ADD COLUMN IF NOT EXISTS home_color TEXT;

ALTER TABLE public.pickem_settings ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT false;
