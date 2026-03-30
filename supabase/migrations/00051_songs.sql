-- IMPORTANT: Also run `npx tsx scripts/create-songs-bucket.ts` to create the
-- "songs" storage bucket (public). Supabase storage buckets cannot be created via SQL.

-- Songs table
CREATE TABLE IF NOT EXISTS songs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  mp3_url TEXT NOT NULL,
  art_url TEXT,
  lyrics TEXT,
  duration_seconds SMALLINT,
  tagged_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Song favorites table
CREATE TABLE IF NOT EXISTS song_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  song_id UUID NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, song_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_songs_tagged_user ON songs(tagged_user_id);
CREATE INDEX IF NOT EXISTS idx_songs_sort_order ON songs(sort_order);
CREATE INDEX IF NOT EXISTS idx_song_favorites_user ON song_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_song_favorites_song ON song_favorites(song_id);

-- RLS
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE song_favorites ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read songs
DROP POLICY IF EXISTS "songs_select" ON songs;
CREATE POLICY "songs_select" ON songs FOR SELECT
  TO authenticated USING (true);

-- Favorites: users manage their own
DROP POLICY IF EXISTS "song_favorites_select" ON song_favorites;
CREATE POLICY "song_favorites_select" ON song_favorites FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "song_favorites_insert" ON song_favorites;
CREATE POLICY "song_favorites_insert" ON song_favorites FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "song_favorites_delete" ON song_favorites;
CREATE POLICY "song_favorites_delete" ON song_favorites FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_songs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS songs_updated_at ON songs;
CREATE TRIGGER songs_updated_at
  BEFORE UPDATE ON songs
  FOR EACH ROW
  EXECUTE FUNCTION update_songs_updated_at();
