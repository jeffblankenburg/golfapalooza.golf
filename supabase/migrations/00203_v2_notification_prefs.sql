-- Per-user notification preferences (opt-out model). A row exists only when a
-- user has turned a category OFF; a missing row means enabled. Scoped per org
-- (a Loozer in two orgs can tune each independently). `category` is a stable key
-- from src/lib/v2/notification-prefs.ts (e.g. 'chat', 'photos'), NOT a raw type —
-- a category governs one or more underlying notification types.

DROP TABLE IF EXISTS public.v2_notification_prefs;

CREATE TABLE public.v2_notification_prefs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id, category)
);
CREATE INDEX idx_v2_notification_prefs_lookup ON public.v2_notification_prefs(org_id, category, user_id);

ALTER TABLE public.v2_notification_prefs ENABLE ROW LEVEL SECURITY;

-- Users manage their own preferences; the send path reads via service role.
CREATE POLICY "v2_notif_prefs_own" ON public.v2_notification_prefs FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_notification_prefs TO authenticated, service_role;
