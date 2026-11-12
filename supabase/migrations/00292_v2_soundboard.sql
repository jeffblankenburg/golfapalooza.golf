-- v2 Soundboard: an org-scoped board of short, tappable sound clips that
-- operators (admins + members granted `manage_soundboard`) play and blast to the
-- whole group. Mirrors the v2_songs shape (org-scoped, member-read / admin-write,
-- service-role handles operator writes after an API permission check).
--
-- Tables:
--   v2_sounds            - the clips (audio + emoji/image icon + counters)
--   v2_sound_tags        - the group's consistent tag vocabulary (one spelling)
--   v2_sound_tag_map     - M:N sound <-> tag
--   v2_sound_plays       - full play history (powers "top blaster")
--   v2_sound_user_plays  - denormalized per-user counter ("my most played", instant)
-- RPC v2_log_sound_play logs a play + bumps both counters in one round-trip.

DROP FUNCTION IF EXISTS public.v2_soundboard_top_blasters(UUID);
DROP FUNCTION IF EXISTS public.v2_log_sound_play(UUID);
DROP TABLE IF EXISTS public.v2_sound_user_plays;
DROP TABLE IF EXISTS public.v2_sound_plays;
DROP TABLE IF EXISTS public.v2_sound_tag_map;
DROP TABLE IF EXISTS public.v2_sound_tags;
DROP TABLE IF EXISTS public.v2_sounds;

CREATE TABLE public.v2_sounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  audio_url     TEXT NOT NULL,
  audio_path    TEXT NOT NULL,
  emoji         TEXT,
  image_url     TEXT,
  image_path    TEXT,
  play_count    INTEGER NOT NULL DEFAULT 0,
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v2_sounds_org_sort ON public.v2_sounds(org_id, sort_order, name);
CREATE INDEX idx_v2_sounds_org_plays ON public.v2_sounds(org_id, play_count DESC);

CREATE TABLE public.v2_sound_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One canonical spelling per group (no "funny" / "Funny" drift).
CREATE UNIQUE INDEX uq_v2_sound_tags_org_name ON public.v2_sound_tags(org_id, lower(name));

CREATE TABLE public.v2_sound_tag_map (
  sound_id  UUID NOT NULL REFERENCES public.v2_sounds(id) ON DELETE CASCADE,
  tag_id    UUID NOT NULL REFERENCES public.v2_sound_tags(id) ON DELETE CASCADE,
  org_id    UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (sound_id, tag_id)
);
CREATE INDEX idx_v2_sound_tag_map_tag ON public.v2_sound_tag_map(tag_id);

CREATE TABLE public.v2_sound_plays (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  sound_id   UUID NOT NULL REFERENCES public.v2_sounds(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  played_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_v2_sound_plays_sound ON public.v2_sound_plays(sound_id);
CREATE INDEX idx_v2_sound_plays_org_time ON public.v2_sound_plays(org_id, played_at DESC);

CREATE TABLE public.v2_sound_user_plays (
  user_id        UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  sound_id       UUID NOT NULL REFERENCES public.v2_sounds(id) ON DELETE CASCADE,
  org_id         UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  play_count     INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, sound_id)
);
CREATE INDEX idx_v2_sound_user_plays_rank ON public.v2_sound_user_plays(org_id, user_id, play_count DESC);

-- One round-trip, one transaction: log the play, bump the group counter, upsert
-- the per-user counter. Returns the new group play_count. SECURITY DEFINER so it
-- can write regardless of RLS; still gated to org members via auth.uid().
CREATE FUNCTION public.v2_log_sound_play(p_sound_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user  UUID := auth.uid();
  v_org   UUID;
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT org_id INTO v_org FROM public.v2_sounds WHERE id = p_sound_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'sound not found';
  END IF;
  IF NOT public.v2_is_org_member(v_org) THEN
    RAISE EXCEPTION 'not a member';
  END IF;

  INSERT INTO public.v2_sound_plays (org_id, sound_id, user_id)
    VALUES (v_org, p_sound_id, v_user);

  UPDATE public.v2_sounds SET play_count = play_count + 1
    WHERE id = p_sound_id
    RETURNING play_count INTO v_count;

  INSERT INTO public.v2_sound_user_plays (user_id, sound_id, org_id, play_count, last_played_at)
    VALUES (v_user, p_sound_id, v_org, 1, now())
    ON CONFLICT (user_id, sound_id)
    DO UPDATE SET play_count = public.v2_sound_user_plays.play_count + 1, last_played_at = now();

  RETURN v_count;
END;
$$;

-- Top blaster per sound (who played each clip most), for the stats view. Reads
-- the per-user counter so it avoids the 1000-row .select() cap and any aggregate.
CREATE FUNCTION public.v2_soundboard_top_blasters(p_org UUID)
RETURNS TABLE (sound_id UUID, user_id UUID, play_count INTEGER)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (up.sound_id) up.sound_id, up.user_id, up.play_count
  FROM public.v2_sound_user_plays up
  WHERE up.org_id = p_org
  ORDER BY up.sound_id, up.play_count DESC, up.last_played_at DESC;
$$;

ALTER TABLE public.v2_sounds           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_sound_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_sound_tag_map    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_sound_plays      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_sound_user_plays ENABLE ROW LEVEL SECURITY;

-- Sounds / tags / mappings: org members read; admins write at the DB layer.
-- Operator (manage_soundboard) writes go through the service role after an API
-- permission check, same as the music library.
CREATE POLICY "v2_sounds_select" ON public.v2_sounds FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_sounds_write" ON public.v2_sounds FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

CREATE POLICY "v2_sound_tags_select" ON public.v2_sound_tags FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_sound_tags_write" ON public.v2_sound_tags FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

CREATE POLICY "v2_sound_tag_map_select" ON public.v2_sound_tag_map FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_sound_tag_map_write" ON public.v2_sound_tag_map FOR ALL
  TO authenticated USING (public.v2_is_org_admin(org_id)) WITH CHECK (public.v2_is_org_admin(org_id));

-- Plays + per-user counters: each user owns their own rows; members read for
-- leaderboards. (The RPC writes via SECURITY DEFINER.)
CREATE POLICY "v2_sound_plays_insert" ON public.v2_sound_plays FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "v2_sound_plays_select" ON public.v2_sound_plays FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_sound_user_plays_own" ON public.v2_sound_user_plays FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "v2_sound_user_plays_read" ON public.v2_sound_user_plays FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_sounds           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_sound_tags       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_sound_tag_map    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_sound_plays      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_sound_user_plays TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_log_sound_play(UUID)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.v2_soundboard_top_blasters(UUID) TO authenticated, service_role;

-- updated_at bumps
CREATE OR REPLACE FUNCTION public.update_v2_sounds_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS v2_sounds_updated_at ON public.v2_sounds;
CREATE TRIGGER v2_sounds_updated_at
  BEFORE UPDATE ON public.v2_sounds
  FOR EACH ROW EXECUTE FUNCTION public.update_v2_sounds_updated_at();

DROP TRIGGER IF EXISTS v2_sound_tags_updated_at ON public.v2_sound_tags;
CREATE TRIGGER v2_sound_tags_updated_at
  BEFORE UPDATE ON public.v2_sound_tags
  FOR EACH ROW EXECUTE FUNCTION public.update_v2_sounds_updated_at();
