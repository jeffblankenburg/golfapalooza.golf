-- v2 music / jukebox. Mirrors the legacy songs/song_favorites/song_plays trio
-- but org-scoped and v2-owned. History is imported separately (00201) preserving
-- original UUIDs, so IDs are plain uuid PKs (default for new rows). Migrated
-- mp3_url/art_url point at the still-public legacy `songs` bucket, so they keep
-- working with no new bucket (same approach as chat images + gallery media).
-- Walk-up entries (the trip-scoped admin announcer tool) are intentionally NOT
-- ported here — that's a separate admin surface, out of scope for the player.

DROP TABLE IF EXISTS public.v2_song_plays;
DROP TABLE IF EXISTS public.v2_song_favorites;
DROP TABLE IF EXISTS public.v2_songs;
DROP FUNCTION IF EXISTS public.v2_song_play_counts(UUID);
DROP FUNCTION IF EXISTS public.v2_song_favorite_counts(UUID);

CREATE TABLE public.v2_songs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id         UUID REFERENCES public.v2_events(id) ON DELETE SET NULL,
  legacy_song_id   UUID UNIQUE,
  title            VARCHAR(255) NOT NULL,
  mp3_url          TEXT NOT NULL,
  art_url          TEXT,
  art_thumb_url    TEXT,
  lyrics           TEXT,
  duration_seconds SMALLINT,
  tagged_user_id   UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v2_songs_org_sort ON public.v2_songs(org_id, sort_order, title);
CREATE INDEX idx_v2_songs_tagged_user ON public.v2_songs(tagged_user_id);

CREATE TABLE public.v2_song_favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  song_id    UUID NOT NULL REFERENCES public.v2_songs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, song_id)
);
CREATE INDEX idx_v2_song_favorites_user ON public.v2_song_favorites(user_id);
CREATE INDEX idx_v2_song_favorites_song ON public.v2_song_favorites(song_id);

CREATE TABLE public.v2_song_plays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  song_id    UUID NOT NULL REFERENCES public.v2_songs(id) ON DELETE CASCADE,
  played_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v2_song_plays_song ON public.v2_song_plays(song_id);
CREATE INDEX idx_v2_song_plays_user ON public.v2_song_plays(user_id);

-- Aggregated counts for a future Song Manager admin grid (parity with legacy
-- song_play_counts/song_favorite_counts; avoids the 1000-row .select() cap).
CREATE FUNCTION public.v2_song_play_counts(p_org UUID)
RETURNS TABLE (song_id UUID, play_count BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT sp.song_id, COUNT(*)::BIGINT
  FROM public.v2_song_plays sp
  JOIN public.v2_songs s ON s.id = sp.song_id
  WHERE s.org_id = p_org
  GROUP BY sp.song_id;
$$;

CREATE FUNCTION public.v2_song_favorite_counts(p_org UUID)
RETURNS TABLE (song_id UUID, like_count BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT sf.song_id, COUNT(*)::BIGINT
  FROM public.v2_song_favorites sf
  JOIN public.v2_songs s ON s.id = sf.song_id
  WHERE s.org_id = p_org
  GROUP BY sf.song_id;
$$;

ALTER TABLE public.v2_songs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_song_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_song_plays     ENABLE ROW LEVEL SECURITY;

-- Songs: org members read; admins manage (upload/edit ported later, service_role
-- handles the import). Mirrors the gallery-items admin/member split.
CREATE POLICY "v2_songs_select" ON public.v2_songs FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_songs_write" ON public.v2_songs FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

-- Favorites + plays: each user manages their own rows.
CREATE POLICY "v2_song_favorites_own" ON public.v2_song_favorites FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "v2_song_plays_insert" ON public.v2_song_plays FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "v2_song_plays_select" ON public.v2_song_plays FOR SELECT
  TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_songs          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_song_favorites TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_song_plays     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_song_play_counts(UUID)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_song_favorite_counts(UUID) TO authenticated, service_role;

-- updated_at bump
CREATE OR REPLACE FUNCTION public.update_v2_songs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS v2_songs_updated_at ON public.v2_songs;
CREATE TRIGGER v2_songs_updated_at
  BEFORE UPDATE ON public.v2_songs
  FOR EACH ROW EXECUTE FUNCTION public.update_v2_songs_updated_at();
