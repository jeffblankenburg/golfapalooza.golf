-- 00300_v2_lodging.sql
-- v2 Lodging feature (member-facing "Rooms"). Models group housing flexibly enough
-- for both "we took over a whole hotel" (many numbered rooms, smoking/pet flags) and
-- "we rented one 7-bedroom Airbnb" (named bedrooms, no numbers). Three tiers:
--
--   property  — one lodging LOCATION (a hotel, or a single rental). Carries the
--               address, listing URL, floorplan/photo images, and notes. A group
--               with multiple rentals just has multiple properties (= multiple
--               addresses). Event-scoped so each event sets up its own lodging.
--   room      — a sleeping space within a property. Universal nullable field set so
--               a hotel room ("214", smoking) and an Airbnb bedroom ("Master Suite",
--               king, floor 2) both fit without separate schemas.
--   assignment— who is staying in which room (admin-assigned, mirrors v1 Rooms).
--               UNIQUE(event_id, user_id) => one room per person per event.
--
-- The feature is opt-in via the `rooms` entry in FEATURE_CATALOG (off by default),
-- so groups with no lodging needs never see it.

-- ── Properties ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.v2_lodging_properties CASCADE;
CREATE TABLE public.v2_lodging_properties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id    UUID NOT NULL REFERENCES public.v2_events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT,                       -- 'hotel' | 'house' | 'other' (display/icon only; fields are universal)
  address     TEXT,
  listing_url TEXT,                        -- link to the hotel / Airbnb listing
  notes       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_lodging_properties_event ON public.v2_lodging_properties(event_id, sort_order);

-- ── Property images (floorplans + photos) ────────────────────────────────────
DROP TABLE IF EXISTS public.v2_lodging_property_images CASCADE;
CREATE TABLE public.v2_lodging_property_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.v2_lodging_properties(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_lodging_property_images_property ON public.v2_lodging_property_images(property_id, sort_order);

-- ── Rooms ────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.v2_lodging_rooms CASCADE;
CREATE TABLE public.v2_lodging_rooms (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES public.v2_lodging_properties(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES public.v2_events(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,              -- room number ("214") OR bedroom name ("Master Suite")
  floor        TEXT,                        -- free text: "2", "Ground", "Loft"
  bed_type     TEXT,                        -- 'King' | 'Queen' | 'Double' | 'Full' | 'Twin' | 'Bunk' | 'Sofa' | ...
  bed_count    INTEGER,
  capacity     INTEGER,                     -- max occupancy; soft-enforced (warn, don't block)
  smoking      BOOLEAN NOT NULL DEFAULT FALSE,
  pet_friendly BOOLEAN NOT NULL DEFAULT FALSE,
  accessible   BOOLEAN NOT NULL DEFAULT FALSE,  -- ADA / step-free
  private_bath BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_lodging_rooms_property ON public.v2_lodging_rooms(property_id, sort_order);
CREATE INDEX idx_v2_lodging_rooms_event ON public.v2_lodging_rooms(event_id);

-- ── Assignments ──────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.v2_lodging_assignments CASCADE;
CREATE TABLE public.v2_lodging_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id    UUID NOT NULL REFERENCES public.v2_lodging_rooms(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id   UUID NOT NULL REFERENCES public.v2_events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One room per person per event: assigning someone already placed MOVES them
  -- (the API upserts on this key), mirroring v1's auto-reassign behavior.
  UNIQUE(event_id, user_id)
);
CREATE INDEX idx_v2_lodging_assignments_room ON public.v2_lodging_assignments(room_id);

-- ── RLS (permissive at DB; writes gated to admins in the API) ─────────────────
ALTER TABLE public.v2_lodging_properties       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_lodging_property_images  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_lodging_rooms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_lodging_assignments      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_lodging_properties_all"      ON public.v2_lodging_properties      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_lodging_property_images_all" ON public.v2_lodging_property_images FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_lodging_rooms_all"           ON public.v2_lodging_rooms           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_lodging_assignments_all"     ON public.v2_lodging_assignments     FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Grants (required: tables are unreachable from supabase-js without these) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_lodging_properties      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_lodging_property_images TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_lodging_rooms           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_lodging_assignments     TO authenticated, service_role;

-- ── Storage bucket for floorplans / property photos (public read) ─────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('v2-lodging', 'v2-lodging', true)
ON CONFLICT (id) DO NOTHING;
