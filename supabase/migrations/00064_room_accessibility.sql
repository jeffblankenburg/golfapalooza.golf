-- Add handicapped and pet_friendly flags to rooms

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS handicapped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pet_friendly BOOLEAN NOT NULL DEFAULT false;
