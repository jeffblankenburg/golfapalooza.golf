-- Trip settings table (singleton — one active trip at a time)
CREATE TABLE IF NOT EXISTS public.trip_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_name VARCHAR(100) NOT NULL DEFAULT 'Golfapalooza',
  trip_year SMALLINT NOT NULL,
  start_date DATE NOT NULL,
  location VARCHAR(200),
  hotel_name VARCHAR(200),
  hotel_address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.trip_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read trip settings
CREATE POLICY "Authenticated users can read trip settings"
  ON public.trip_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can manage trip settings"
  ON public.trip_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- Seed with 2026 trip
INSERT INTO public.trip_settings (trip_name, trip_year, start_date)
VALUES ('Golfapalooza 2026', 2026, '2026-09-02');
