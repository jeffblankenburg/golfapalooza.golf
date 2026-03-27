-- Standalone tee times (decoupled from scramble teams)
-- Tee time groups apply to ALL golf days (KGB Cup day 1 + scramble days 2-4)

CREATE TABLE IF NOT EXISTS public.tee_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  day_number SMALLINT NOT NULL,
  tee_time TIME,
  starting_hole SMALLINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tee_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tee times"
  ON public.tee_times FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage tee times"
  ON public.tee_times FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_tee_times_trip_day ON public.tee_times(trip_id, day_number);

-- Players assigned to tee time groups
CREATE TABLE IF NOT EXISTS public.tee_time_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id UUID NOT NULL REFERENCES public.tee_times(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tee_time_id, user_id)
);

ALTER TABLE public.tee_time_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tee time players"
  ON public.tee_time_players FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage tee time players"
  ON public.tee_time_players FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_tee_time_players_tee_time ON public.tee_time_players(tee_time_id);
CREATE INDEX idx_tee_time_players_user ON public.tee_time_players(user_id);
