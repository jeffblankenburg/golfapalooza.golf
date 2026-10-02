-- v2 financial management (#213). cost_items is the single source of truth for
-- every dollar in an event (contest buy-ins, lodging, meals, shirts, option fees).
-- Each item reconciles to exactly one bucket: the Trip Cost (included_in_trip_cost,
-- folded into the base price everyone pays), an Option (linked_option_id, opt-in),
-- or neither (operational / pass-through, tracked but not charged).
--
-- Amount lives HERE — cost-bearing things (contests, side games, …) point at a
-- cost_item via source_type/source_id rather than storing their own amount.
--
-- RLS: permissive at the DB; writes are admin-gated in the API (mirrors the rest
-- of v2). Members may read, but the UI never shows the breakdown to non-admins.

DROP TABLE IF EXISTS public.v2_cost_items CASCADE;

CREATE TABLE public.v2_cost_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id              UUID NOT NULL REFERENCES public.v2_events(id)        ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  amount_cents          INTEGER NOT NULL DEFAULT 0,
  category              TEXT,          -- contest | side_game | lodging | food | shirts | operational | pass_through | other
  included_in_trip_cost BOOLEAN NOT NULL DEFAULT false,
  linked_option_id      UUID,          -- → v2_options once that lands (phase 3); plain UUID for now
  source_type           TEXT NOT NULL DEFAULT 'manual',  -- manual | contest | side_game | lodging | …
  source_id             UUID,          -- the owning row (e.g. the contest); NULL for manual
  sort_order            INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_by            UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_cost_items_event ON public.v2_cost_items(event_id, sort_order);
CREATE INDEX idx_v2_cost_items_source ON public.v2_cost_items(source_type, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE public.v2_cost_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_cost_items_all" ON public.v2_cost_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_cost_items TO authenticated, service_role;
