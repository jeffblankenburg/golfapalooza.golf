-- Walk-up songs (announcer tool at /admin/music/walkups).
-- One row per (trip, participant) that the announcer has touched: it stores the
-- chosen song (when a Loozer has more than one tagged song), the start offset in
-- seconds to begin playback from, and a manual play-order override. Rows are
-- created lazily on the first save from the walk-up player; participants with no
-- row fall back to the tee-time-derived default order (Thursday scramble, day 2).

DROP TABLE IF EXISTS public.walkup_entries;

CREATE TABLE public.walkup_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  song_id UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  start_seconds INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);

CREATE INDEX idx_walkup_entries_trip ON public.walkup_entries(trip_id, sort_order);

ALTER TABLE public.walkup_entries ENABLE ROW LEVEL SECURITY;

-- Admins (with manage_music) drive this exclusively via the service-role admin
-- client, but expose read to authenticated and writes to admins for parity with
-- the other admin-managed tables.
DROP POLICY IF EXISTS "walkup_entries_select" ON public.walkup_entries;
CREATE POLICY "walkup_entries_select" ON public.walkup_entries FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "walkup_entries_admin_write" ON public.walkup_entries;
CREATE POLICY "walkup_entries_admin_write" ON public.walkup_entries FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- updated_at trigger (reuse the generic bump function if present, else inline)
CREATE OR REPLACE FUNCTION public.update_walkup_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS walkup_entries_updated_at ON public.walkup_entries;
CREATE TRIGGER walkup_entries_updated_at
  BEFORE UPDATE ON public.walkup_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_walkup_entries_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.walkup_entries TO authenticated, service_role;
