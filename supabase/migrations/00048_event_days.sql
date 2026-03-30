-- Event days: named, typed days for each trip
-- Replaces hard-coded day 1-4 pattern throughout the app

CREATE TABLE IF NOT EXISTS public.event_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  day_number SMALLINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  day_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, day_number)
);

ALTER TABLE public.event_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read event days"
  ON public.event_days FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert event days"
  ON public.event_days FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can update event days"
  ON public.event_days FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can delete event days"
  ON public.event_days FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_event_days_trip ON public.event_days(trip_id, day_number);

-- Seed default days for existing active trip
DO $$
DECLARE
  v_trip_id UUID;
BEGIN
  SELECT id INTO v_trip_id FROM public.trip_settings WHERE status = 'active' LIMIT 1;
  IF v_trip_id IS NOT NULL THEN
    INSERT INTO public.event_days (trip_id, day_number, name, day_type) VALUES
      (v_trip_id, 1, 'KGB Cup', 'ryder_cup'),
      (v_trip_id, 2, 'Scramble Day 1', 'scramble'),
      (v_trip_id, 3, 'Scramble Day 2', 'scramble'),
      (v_trip_id, 4, 'Scramble Day 3', 'scramble')
    ON CONFLICT (trip_id, day_number) DO NOTHING;
  END IF;
END $$;
