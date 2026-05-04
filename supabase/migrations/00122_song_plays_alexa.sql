-- Allow non-user-attributed plays (Alexa skill, etc.) and tag the source.
-- Existing rows are web plays with a user_id set; new Alexa plays have user_id = NULL.

ALTER TABLE song_plays
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE song_plays
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'alexa'));

CREATE INDEX IF NOT EXISTS idx_song_plays_source ON song_plays(source);

-- RLS: keep the existing authenticated-user insert policy. Alexa plays are
-- inserted server-side with the service role, which bypasses RLS.
