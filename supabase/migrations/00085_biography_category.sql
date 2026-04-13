-- Add is_system flag to notebook_categories so Biographies (and future system categories)
-- are protected from rename/delete and hidden from the player notebook view.

ALTER TABLE public.notebook_categories ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Create a "Biographies" category for every existing trip that doesn't already have one.
INSERT INTO public.notebook_categories (trip_id, name, sort_order, is_system)
SELECT ts.id, 'Biographies', 9999, TRUE
FROM public.trip_settings ts
WHERE NOT EXISTS (
  SELECT 1 FROM public.notebook_categories nc
  WHERE nc.trip_id = ts.id AND nc.is_system = TRUE AND nc.name = 'Biographies'
);
