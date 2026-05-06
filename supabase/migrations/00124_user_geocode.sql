-- Adds geocode cache + map opt-out for the /loozers map view (issue #120).
-- latitude/longitude are populated from city + state via Mapbox Geocoding —
-- only city-level precision (Mapbox returns the city centroid for a city/state
-- query). geocoded_at stores the timestamp; the geocode-on-write hooks in
-- /api/profile and /api/admin/users compare current city/state to the value
-- that produced (lat, lng) and re-geocode when they diverge.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS show_on_map boolean NOT NULL DEFAULT true;
