-- Add room properties: smoking, showers, bed type

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS smoking BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS showers SMALLINT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS bed_type VARCHAR(30) DEFAULT 'Double';
