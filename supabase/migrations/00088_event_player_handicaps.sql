-- Trip-level handicap snapshots.
-- When the admin "locks" handicaps for an event, each participant's current
-- handicap index is copied here.  Contest-specific logic (KGB Cup adjustments,
-- scramble team handicaps) can reference this locked value instead of the live
-- player_handicaps table.

CREATE TABLE IF NOT EXISTS public.event_player_handicaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  handicap_index NUMERIC(4,1),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);

CREATE INDEX idx_event_player_handicaps_trip ON public.event_player_handicaps(trip_id);

ALTER TABLE public.event_player_handicaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read event_player_handicaps"
  ON public.event_player_handicaps
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage event_player_handicaps"
  ON public.event_player_handicaps
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE TRIGGER event_player_handicaps_updated_at
  BEFORE UPDATE ON public.event_player_handicaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
