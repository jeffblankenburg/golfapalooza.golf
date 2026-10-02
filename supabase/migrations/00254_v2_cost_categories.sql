-- 00254_v2_cost_categories.sql
-- Platform-managed reference data: cost-item categories (#216 follow-up). Moves the
-- hardcoded category list (src/lib/v2/cost-items.ts) into a table that SYSTEM ADMINS
-- manage from the platform console (/new/admin). First resident of a general
-- "platform data management" area (GH #178 system-admin tier). Group-level overrides
-- can layer on later; this is the shared default set.
--
-- cost_items.category stays a plain TEXT key (no FK, backward compatible); this table
-- supplies the human label + emoji icon for display and the pick list.

DROP TABLE IF EXISTS public.v2_cost_categories CASCADE;
CREATE TABLE public.v2_cost_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,     -- stable slug stored on cost_items.category
  label      TEXT NOT NULL,            -- display name
  icon       TEXT,                     -- emoji, rendered inline (works in native <select>)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.v2_cost_categories (key, label, icon, sort_order) VALUES
  ('lodging',      'Lodging',      '🏨', 0),
  ('food',         'Food',         '🍽️', 1),
  ('shirts',       'Shirts',       '👕', 2),
  ('operational',  'Operational',  '⚙️', 3),
  ('pass_through', 'Pass-through', '🔁', 4),
  ('other',        'Other',        '🏷️', 5)
ON CONFLICT (key) DO NOTHING;

-- Platform reference data: everyone may READ (needed to render labels); only the
-- service-role client WRITES (the API gates those on isSystemAdmin). No write policy
-- for authenticated, so a hand-rolled client can't mutate platform data.
ALTER TABLE public.v2_cost_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_cost_categories_read" ON public.v2_cost_categories FOR SELECT TO authenticated USING (true);

GRANT SELECT ON TABLE public.v2_cost_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_cost_categories TO service_role;
