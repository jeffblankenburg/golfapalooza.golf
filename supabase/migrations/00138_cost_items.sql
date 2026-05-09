-- Issue #125 Phase 1 — cost_items as the universal source of truth for $$.
-- Phase 1 is purely additive: the table is created but no code reads or
-- writes it yet. Backfill comes in Phase 2; reads switch behind feature
-- flags in Phase 3.
--
-- The catalog is standalone. Other tables reference cost_items via FK
-- columns living on THEIR side (e.g. `contests.buy_in_cost_item_id`,
-- `trip_options.choices[].cost_item_ids`) — a row in cost_items doesn't
-- need to know who's pointing at it.
--
-- Two flags govern what a row means in trip economics:
--   1. included_in_trip_cost = true  → bundled into the bulk Trip Cost lump
--                                       that everyone going pays
--   2. category                       → bookkeeping grouping (lodging, food,
--                                       event_pot, option_entry, operational,
--                                       pass_through, etc.)
--
-- Loozer-facing UX rule: the breakdown is admin-only. Regular users still
-- see "Trip Cost: $651" as a single opaque line item. The cost_items table
-- is for bookkeeping; surfacing it to Loozers would expose internal budget
-- discipline that admins manage privately.

CREATE TABLE IF NOT EXISTS public.cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,

  name VARCHAR(120) NOT NULL,
  description TEXT,
  cost NUMERIC(10,2) NOT NULL CHECK (cost >= 0),

  -- Bookkeeping category — drives grouping in the admin UI.
  -- Free-form string for now (e.g. 'lodging', 'food', 'event_pot',
  -- 'option_entry', 'pass_through', 'operational'). A CHECK or enum can
  -- follow later once the categories settle.
  category VARCHAR(40),

  -- Bundled into the bulk Trip Cost ($651 today)?
  included_in_trip_cost BOOLEAN NOT NULL DEFAULT false,

  sort_order SMALLINT NOT NULL DEFAULT 0,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cost_items_trip
  ON public.cost_items(trip_id, sort_order);

ALTER TABLE public.cost_items ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user. Note: even though RLS allows reads, the
-- application MUST NOT surface the breakdown to non-admin Loozers (UX rule
-- captured in #125). RLS protects against direct API access; the UX rule
-- protects against accidental admin-tool reuse on Loozer pages.
CREATE POLICY "Authenticated users can read cost_items"
  ON public.cost_items FOR SELECT TO authenticated USING (true);

-- Write: finance-permitted admins only.
CREATE POLICY "Finance admins can manage cost_items"
  ON public.cost_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (is_admin = true OR (permissions->>'manage_finances')::boolean = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (is_admin = true OR (permissions->>'manage_finances')::boolean = true)
    )
  );

CREATE TRIGGER cost_items_updated_at
  BEFORE UPDATE ON public.cost_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
