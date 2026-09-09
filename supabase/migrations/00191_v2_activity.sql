-- v2 activity feed: a unified, forward-only event log. v2 features append a row
-- as things happen (a round posts, a photo uploads, a song is added, an article
-- publishes, an announcement goes out). The home feed reads the most recent rows.
-- No historical backfill by design — the feed fills as v2 generates activity.
--
-- `kind` is intentionally free-text (extensible) — known values today:
--   'round' | 'photo' | 'song' | 'article' | 'announcement'
-- `link` is an in-app path; `ref_id` points back at the source entity so a
-- feature can dedupe/update its own rows.

DROP TABLE IF EXISTS public.v2_activity;

CREATE TABLE public.v2_activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id   UUID REFERENCES public.v2_events(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,
  actor_id   UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  subtitle   TEXT,
  image_url  TEXT,
  link       TEXT,
  ref_id     UUID,
  metadata   JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_v2_activity_org_created ON public.v2_activity(org_id, created_at DESC);

ALTER TABLE public.v2_activity ENABLE ROW LEVEL SECURITY;

-- Members read their org's activity; admins manage; writes are usually server-side
-- (service role) from the feature that generated the event.
CREATE POLICY "v2_activity_select" ON public.v2_activity FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));
CREATE POLICY "v2_activity_admin" ON public.v2_activity FOR ALL
  TO authenticated
  USING (public.v2_is_org_admin(org_id))
  WITH CHECK (public.v2_is_org_admin(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_activity TO authenticated, service_role;
