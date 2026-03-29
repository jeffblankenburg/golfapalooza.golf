-- Link calcutta prizes to actual contests instead of free-text names
ALTER TABLE public.calcutta_prizes ADD COLUMN IF NOT EXISTS linked_contest_id UUID REFERENCES public.contests(id) ON DELETE CASCADE;

-- Add per_player support
ALTER TABLE public.calcutta_prizes ADD COLUMN IF NOT EXISTS per_player BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.calcutta_prizes ADD COLUMN IF NOT EXISTS player_count SMALLINT NOT NULL DEFAULT 1;

-- Make prize_name nullable since display name now comes from the linked contest
ALTER TABLE public.calcutta_prizes ALTER COLUMN prize_name DROP NOT NULL;
