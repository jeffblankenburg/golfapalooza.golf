-- Event schedule (#208). A per-day agenda of everything that happens during an
-- event: golf matches, side competitions, meals, TV games, logistics. Mirrors v1
-- itinerary_items (00014) + two additions that make it the event spine:
--   * `kind`        — categorizes the item (drives icon/affordance)
--   * activity link — `activity_type` (+ `activity_id` once the module exists),
--                     so an item can be the front door to an interactive module
--                     (Ryder Cup, scramble, calcutta, cornhole…). NULL = a plain
--                     informational item or an unlinked placeholder slot.
--
-- Naive-local day/time (DATE + TIME) like v1 — the agenda groups by `day`, and we
-- avoid timezone-conversion headaches. Permissive RLS + API-layer gating (writes
-- are admin-only in the API), mirroring v2_round_games.

DROP TABLE IF EXISTS public.v2_schedule_items CASCADE;

CREATE TABLE public.v2_schedule_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES public.v2_events(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  location      TEXT,
  day           DATE NOT NULL,
  start_time    TIME,
  end_time      TIME,
  all_day       BOOLEAN NOT NULL DEFAULT false,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  kind          TEXT NOT NULL DEFAULT 'general'
                  CHECK (kind IN ('activity', 'meal', 'watch', 'logistics', 'general')),
  activity_type TEXT,
  activity_id   UUID,
  created_by    UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_v2_schedule_items_event ON public.v2_schedule_items(event_id, day, start_time);

ALTER TABLE public.v2_schedule_items ENABLE ROW LEVEL SECURITY;

-- Any authed member can read/manage at the DB layer; the API gates writes to org
-- admins (mirrors the v2_round_games permissive policy).
CREATE POLICY "v2_schedule_items_all" ON public.v2_schedule_items FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_schedule_items TO authenticated, service_role;
