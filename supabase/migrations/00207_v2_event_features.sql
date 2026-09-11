-- v2 feature registry — the per-event (defaulting-from-org) source of truth for
-- which features are turned on and how they surface in the shell. Drives all
-- three nav tiers: the admin-pinned bottom bar, the "Everything" launcher, and
-- (later) the spectator view. See docs/v2-information-architecture.md.
--
-- Scope is encoded by event_id:
--   event_id IS NULL  → the ORG DEFAULT for this feature (applies to every event
--                        that hasn't overridden it).
--   event_id = <uuid> → the per-event OVERRIDE.
-- The app resolves catalog-default < org-default < event-override at read time
-- (src/lib/v2/features.ts), so nothing needs seeding when an event is created.
--
-- feature_key is validated against the app-side FEATURE_CATALOG, not the DB, so
-- new features never require a migration here.

DROP TABLE IF EXISTS public.v2_event_features;

CREATE TABLE public.v2_event_features (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id       UUID REFERENCES public.v2_events(id) ON DELETE CASCADE, -- NULL = org default
  feature_key    TEXT NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT false, -- explicit opt-in: off until an admin turns it on
  pinned         BOOLEAN NOT NULL DEFAULT false, -- sits in the bottom bar (max 3, enforced app-side)
  nav_order      INTEGER NOT NULL DEFAULT 0,     -- order among pinned items
  label_override TEXT,                           -- rename ("KGB Cup" → "Ryder Cup")
  public         BOOLEAN NOT NULL DEFAULT false, -- exposed to spectators (read-only)
  availability   TEXT NOT NULL DEFAULT 'always' CHECK (availability IN ('always', 'window')),
  available_from  TIMESTAMPTZ,                   -- when availability='window': opens at
  available_until TIMESTAMPTZ,                   -- when availability='window': closes at
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL
);

-- One row per (scope, feature). Two partial indexes because NULLs are distinct in
-- a plain UNIQUE — org defaults and event overrides each get their own uniqueness.
CREATE UNIQUE INDEX v2_event_features_event_key
  ON public.v2_event_features(event_id, feature_key) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX v2_event_features_org_default_key
  ON public.v2_event_features(org_id, feature_key) WHERE event_id IS NULL;
CREATE INDEX v2_event_features_event ON public.v2_event_features(event_id);
CREATE INDEX v2_event_features_org ON public.v2_event_features(org_id);

ALTER TABLE public.v2_event_features ENABLE ROW LEVEL SECURITY;

-- Members read the registry (to build their nav); admins manage it.
CREATE POLICY "v2_event_features_select" ON public.v2_event_features FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_event_features_admin" ON public.v2_event_features FOR ALL
  TO authenticated
  USING (public.v2_is_org_admin(org_id))
  WITH CHECK (public.v2_is_org_admin(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_event_features TO authenticated, service_role;
