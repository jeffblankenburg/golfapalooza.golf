-- 00160_itinerary_description.sql
-- Adds an optional long-form `description` to itinerary (schedule) items so
-- entries like meals can list menu/details below the title and location.

ALTER TABLE public.itinerary_items
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Grants already in place from 00014; table access unchanged.
