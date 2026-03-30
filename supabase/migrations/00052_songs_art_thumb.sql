-- Add thumbnail URL column for compressed album art
ALTER TABLE songs ADD COLUMN IF NOT EXISTS art_thumb_url TEXT;
