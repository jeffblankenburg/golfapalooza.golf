-- 00232_v2_member_directory_import.sql
-- Port the v1 /loozers data into v2 so the members directory (grid/tree/map) +
-- member detail can render at full parity. id-preserving: v2_profiles.id =
-- users.id (00186), so sponsor links + accolades carry over by the same ids.

-- 1) Member fields: sponsor hierarchy, founder flag, geocoded location.
ALTER TABLE public.v2_profiles
  ADD COLUMN IF NOT EXISTS sponsor_id UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_founder BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

UPDATE public.v2_profiles p
SET is_founder = COALESCE(u.is_founder, false),
    latitude = u.latitude,
    longitude = u.longitude
FROM public.users u
WHERE u.id = p.id;

-- Sponsor link only where the sponsor also has a v2_profile (self-FK safety).
UPDATE public.v2_profiles p
SET sponsor_id = u.sponsor_id
FROM public.users u
WHERE u.id = p.id
  AND u.sponsor_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.v2_profiles s WHERE s.id = u.sponsor_id);

-- 2) Accolades — one row per award, tied to a member + the trip year.
DROP TABLE IF EXISTS public.v2_accolades;
CREATE TABLE public.v2_accolades (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  year       SMALLINT,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_v2_accolades_user ON public.v2_accolades (user_id, year DESC);

ALTER TABLE public.v2_accolades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_accolades_all" ON public.v2_accolades FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_accolades TO authenticated, service_role;

INSERT INTO public.v2_accolades (id, user_id, title, year, sort_order, created_at)
SELECT a.id, a.user_id, a.title, t.trip_year, a.sort_order, a.created_at
FROM public.accolades a
JOIN public.trip_settings t ON t.id = a.trip_id
WHERE EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = a.user_id)
ON CONFLICT (id) DO NOTHING;
