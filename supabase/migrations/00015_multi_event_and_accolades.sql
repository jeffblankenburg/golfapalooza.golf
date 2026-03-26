-- Add status column to trip_settings for multi-event support
ALTER TABLE public.trip_settings ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Set existing row(s) to active
UPDATE public.trip_settings SET status = 'active' WHERE status IS NULL;

-- Accolades table (fully custom awards assigned to players per event)
CREATE TABLE IF NOT EXISTS public.accolades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for accolades
ALTER TABLE public.accolades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read accolades"
  ON public.accolades FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage accolades"
  ON public.accolades FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
