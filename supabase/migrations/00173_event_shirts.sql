-- Migration: Event Shirt Guide
-- Adds event_shirts — the per-day apparel list rendered on the /shirt-guide
-- page and reachable from the home-page "Shirt Guide" quick link. Each row is
-- one shirt for one day of one event. Admin-managed (create/edit/delete +
-- photo upload); reads are open to any authenticated Loozer. Model mirrors the
-- articles table.

DROP TABLE IF EXISTS public.event_shirts CASCADE;

CREATE TABLE public.event_shirts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  day_label varchar(60) NOT NULL,        -- freeform day heading, e.g. "Thursday"
  name varchar(120) NOT NULL,            -- shirt name, e.g. "Navy Polo"
  description text,                       -- optional notes ("wear with khaki shorts")
  image_url text,                        -- uploaded photo; NULL renders a placeholder
  sort_order integer NOT NULL DEFAULT 0, -- ordering within (and across) days
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_shirts_trip_sort
  ON public.event_shirts (trip_id, sort_order, created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_event_shirts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_event_shirts_updated_at ON public.event_shirts;
CREATE TRIGGER set_event_shirts_updated_at
  BEFORE UPDATE ON public.event_shirts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_event_shirts_updated_at();

-- RLS: any authenticated Loozer can read the guide; only the service role
-- (admin client) writes.
ALTER TABLE public.event_shirts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Shirts readable by authenticated" ON public.event_shirts;
CREATE POLICY "Shirts readable by authenticated" ON public.event_shirts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access" ON public.event_shirts;
CREATE POLICY "Service role full access" ON public.event_shirts
  FOR ALL USING (true) WITH CHECK (true);

-- Data API grants (required for tables created on/after Oct 30 2026)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_shirts TO authenticated, service_role;
