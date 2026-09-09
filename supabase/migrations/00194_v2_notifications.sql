-- v2 notifications + push subscriptions. Reuses the shared web-push machinery
-- (same /public/sw.js + VAPID keys + web-push send path) but owns its own data,
-- per the "reuse shared infra" decision. Notifications are per-user, scoped to an
-- org (the event shell is org-scoped). Push subscriptions are per-device per user.

DROP TABLE IF EXISTS public.v2_notifications;

CREATE TABLE public.v2_notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB NOT NULL DEFAULT '{}',
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_v2_notifications_user
  ON public.v2_notifications(user_id, read, created_at DESC);

ALTER TABLE public.v2_notifications ENABLE ROW LEVEL SECURITY;

-- A user reads/updates/deletes only their own notifications. Inserts happen
-- server-side via the service role (bypasses RLS), so no INSERT policy needed.
CREATE POLICY "v2_notif_select" ON public.v2_notifications FOR SELECT
  TO authenticated USING (user_id = auth.uid());
CREATE POLICY "v2_notif_update" ON public.v2_notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "v2_notif_delete" ON public.v2_notifications FOR DELETE
  TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_notifications
  TO authenticated, service_role;

-- ── Push subscriptions ────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.v2_push_subscriptions;

CREATE TABLE public.v2_push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_v2_push_user ON public.v2_push_subscriptions(user_id);

ALTER TABLE public.v2_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_push_manage_own" ON public.v2_push_subscriptions FOR ALL
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_push_subscriptions
  TO authenticated, service_role;

-- Realtime for live badge/drawer updates (safe to re-run).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
