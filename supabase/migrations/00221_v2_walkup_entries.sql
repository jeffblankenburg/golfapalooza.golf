-- v2 walk-up songs (the announcer tool). One row per (org, Loozer) that the
-- announcer has touched: the chosen song (when a Loozer has more than one tagged
-- song), the start offset to begin playback from, and a manual play-order
-- override. Rows are created lazily on first save; anyone without a row falls
-- back to the default (alphabetical) order.
--
-- NOTE: the legacy tool derived the default order from Thursday scramble tee
-- times + handicap. v2 has no tee-time/scramble system yet (deferred), so the
-- v2 default order is the alphabetical roster; admins reorder manually. When the
-- v2 Scores & Games features land, the default can be upgraded to match.

DROP TABLE IF EXISTS public.v2_walkup_entries;

CREATE TABLE public.v2_walkup_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id      UUID REFERENCES public.v2_events(id) ON DELETE SET NULL,
  user_id       UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  song_id       UUID REFERENCES public.v2_songs(id) ON DELETE SET NULL,
  start_seconds INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER,          -- NULL = follow the default order
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_v2_walkup_org ON public.v2_walkup_entries(org_id, sort_order);

ALTER TABLE public.v2_walkup_entries ENABLE ROW LEVEL SECURITY;

-- Members read; org admins manage. Non-admin manage_music holders reach it via
-- the service-role API (gated by hasPermission), which bypasses RLS.
CREATE POLICY "v2_walkup_select" ON public.v2_walkup_entries FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_walkup_admin" ON public.v2_walkup_entries FOR ALL
  TO authenticated
  USING (public.v2_is_org_admin(org_id))
  WITH CHECK (public.v2_is_org_admin(org_id));

CREATE OR REPLACE FUNCTION public.v2_walkup_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER v2_walkup_updated_at
  BEFORE UPDATE ON public.v2_walkup_entries
  FOR EACH ROW EXECUTE FUNCTION public.v2_walkup_touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_walkup_entries
  TO authenticated, service_role;
