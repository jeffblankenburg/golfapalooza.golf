-- Track song plays for admin statistics
CREATE TABLE IF NOT EXISTS song_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_song_plays_song ON song_plays(song_id);
CREATE INDEX IF NOT EXISTS idx_song_plays_user ON song_plays(user_id);

-- RLS: users can insert their own plays
ALTER TABLE song_plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "song_plays_insert" ON song_plays;
CREATE POLICY "song_plays_insert" ON song_plays FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
