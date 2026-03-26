-- Itinerary items table
CREATE TABLE IF NOT EXISTS public.itinerary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  location VARCHAR(200),
  day_number SMALLINT,           -- NULL = pre-event, 1-4 = trip days
  start_date DATE,               -- for pre-event items
  start_time TIME,
  end_date DATE,                 -- for pre-event items (optional)
  end_time TIME,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.itinerary_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read itinerary"
  ON public.itinerary_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage itinerary"
  ON public.itinerary_items FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed data (uses the first trip_settings row)
DO $$
DECLARE
  v_trip_id UUID;
BEGIN
  SELECT id INTO v_trip_id FROM public.trip_settings LIMIT 1;

  IF v_trip_id IS NOT NULL THEN
    -- Pre-Event items
    INSERT INTO public.itinerary_items (trip_id, title, day_number, start_date, start_time, end_date, end_time, sort_order) VALUES
      (v_trip_id, 'Options Selection', NULL, '2026-05-01', '07:00', '2026-07-31', '23:00', 1),
      (v_trip_id, 'Round 1 and Round 2 Pairings Announced', NULL, '2026-08-15', '07:00', NULL, NULL, 2),
      (v_trip_id, 'Room Assignments Released', NULL, '2026-08-15', '07:00', NULL, NULL, 3),
      (v_trip_id, 'Cornhole Doubles Pairings & Bracket Released', NULL, '2026-08-22', '07:00', NULL, NULL, 4),
      (v_trip_id, 'Cornhole Singles Bracket Released', NULL, '2026-08-22', '07:00', NULL, NULL, 5),
      (v_trip_id, 'Final Handicap Update', NULL, '2026-08-30', '07:00', NULL, NULL, 6);

    -- Day 1: KGB Cup
    INSERT INTO public.itinerary_items (trip_id, title, location, day_number, start_time, end_time, sort_order) VALUES
      (v_trip_id, 'Breakfast Buffet', NULL, 1, '08:00', '10:00', 1),
      (v_trip_id, 'KGB CUP - Shotgun Start', NULL, 1, '13:00', '18:00', 2),
      (v_trip_id, 'Dinner', NULL, 1, '18:00', '20:00', 3),
      (v_trip_id, 'KGB Cup Winner Announcement', NULL, 1, '19:00', '20:00', 4);

    -- Day 2
    INSERT INTO public.itinerary_items (trip_id, title, location, day_number, start_time, end_time, sort_order) VALUES
      (v_trip_id, 'Breakfast Buffet', NULL, 2, '08:00', '10:00', 1),
      (v_trip_id, 'First Tee Toast', NULL, 2, '10:15', '11:00', 2),
      (v_trip_id, 'Dinner', NULL, 2, '17:30', '19:00', 3),
      (v_trip_id, 'Calcutta Auction', NULL, 2, '19:30', '21:00', 4);

    -- Day 3
    INSERT INTO public.itinerary_items (trip_id, title, location, day_number, start_time, end_time, sort_order) VALUES
      (v_trip_id, 'Breakfast Buffet', NULL, 3, '08:00', '10:00', 1),
      (v_trip_id, 'Dinner', NULL, 3, '17:30', '19:00', 2),
      (v_trip_id, 'Round 3 Pairings Draw', NULL, 3, '19:00', '19:30', 3);

    -- Day 4
    INSERT INTO public.itinerary_items (trip_id, title, location, day_number, start_time, end_time, sort_order) VALUES
      (v_trip_id, 'Breakfast Buffet', NULL, 4, '08:00', '10:00', 1),
      (v_trip_id, 'Dinner', NULL, 4, '17:30', '19:00', 2),
      (v_trip_id, 'Awards Presentation', NULL, 4, '21:30', '22:30', 3);
  END IF;
END $$;
