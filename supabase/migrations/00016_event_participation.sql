-- Event participants (who's attending each event)
CREATE TABLE IF NOT EXISTS public.event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id)
);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read event participants"
  ON public.event_participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage event participants"
  ON public.event_participants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- Contests (competitions within an event)
CREATE TABLE IF NOT EXISTS public.contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  contest_type VARCHAR(50) NOT NULL,
  day_number SMALLINT,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contests"
  ON public.contests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage contests"
  ON public.contests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- Contest participants (who's in each contest)
CREATE TABLE IF NOT EXISTS public.contest_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, user_id)
);

ALTER TABLE public.contest_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contest participants"
  ON public.contest_participants FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage contest participants"
  ON public.contest_participants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- Seed default contests for the active event
DO $$
DECLARE
  v_trip_id UUID;
BEGIN
  SELECT id INTO v_trip_id FROM public.trip_settings WHERE status = 'active' LIMIT 1;

  IF v_trip_id IS NOT NULL THEN
    INSERT INTO public.contests (trip_id, name, contest_type, day_number, sort_order) VALUES
      (v_trip_id, 'KGB Cup', 'kgb_cup', 1, 1),
      (v_trip_id, 'Scramble Day 1', 'scramble', 2, 2),
      (v_trip_id, 'Scramble Day 2', 'scramble', 3, 3),
      (v_trip_id, 'Scramble Day 3', 'scramble', 4, 4),
      (v_trip_id, 'Cornhole Singles', 'cornhole_singles', NULL, 5),
      (v_trip_id, 'Cornhole Doubles', 'cornhole_doubles', NULL, 6),
      (v_trip_id, 'Calcutta', 'calcutta', 2, 7);
  END IF;
END $$;
