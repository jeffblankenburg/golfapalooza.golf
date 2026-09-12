-- v2 announcements: admin-authored broadcasts delivered to members as
-- notifications (v2_notifications rows + web push). This table is the authoring
-- record + history; members never read it directly (they receive the delivered
-- notification). Mirrors the legacy scheduled_announcements model, org-scoped.
--
-- Audience:
--   'everyone' → all active org members
--   'event'    → participants of event_id (excluding not_going)
--   'custom'   → the hand-picked audience_user_ids array
-- Timing: scheduled_for NULL/past + send → status 'sent' immediately; a future
-- scheduled_for stays 'pending' until the v2-announcements cron promotes it.

DROP TABLE IF EXISTS public.v2_announcements;

CREATE TABLE public.v2_announcements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  body              TEXT,
  audience_type     TEXT NOT NULL DEFAULT 'everyone'
                      CHECK (audience_type IN ('everyone', 'event', 'custom')),
  audience_user_ids JSONB,   -- set only when audience_type = 'custom'
  event_id          UUID REFERENCES public.v2_events(id) ON DELETE SET NULL, -- set only when 'event'
  scheduled_for     TIMESTAMPTZ,   -- NULL = send immediately on create
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sent', 'cancelled')),
  recipient_count   INTEGER,   -- snapshot of how many members were notified
  created_by        UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX idx_v2_announcements_org ON public.v2_announcements(org_id, created_at DESC);
CREATE INDEX idx_v2_announcements_due ON public.v2_announcements(scheduled_for)
  WHERE status = 'pending';

ALTER TABLE public.v2_announcements ENABLE ROW LEVEL SECURITY;

-- Only org admins manage via RLS; members with the send_announcements grant reach
-- it through the service-role API (gated by hasPermission), which bypasses RLS.
CREATE POLICY "v2_announcements_admin" ON public.v2_announcements FOR ALL
  TO authenticated
  USING (public.v2_is_org_admin(org_id))
  WITH CHECK (public.v2_is_org_admin(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_announcements
  TO authenticated, service_role;
