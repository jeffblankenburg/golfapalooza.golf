-- Event RSVP roster for the v2 platform. One row = "this member responded to
-- this event." Powers the home-page Registration module and any attendee count.
-- org_id is denormalized from the event so RLS can reuse the existing
-- v2_is_org_member / v2_is_org_admin helpers directly (no join in the policy).
-- A member manages only their OWN row; org admins manage anyone's.

DROP TABLE IF EXISTS public.v2_event_participants;

CREATE TABLE public.v2_event_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES public.v2_events(id)        ON DELETE CASCADE,
  org_id     UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id)      ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'going'
             CHECK (status IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX idx_v2_event_participants_event ON public.v2_event_participants(event_id);
CREATE INDEX idx_v2_event_participants_user  ON public.v2_event_participants(user_id);

ALTER TABLE public.v2_event_participants ENABLE ROW LEVEL SECURITY;

-- Any org member can see the roster for their org's events.
CREATE POLICY "v2_ep_select" ON public.v2_event_participants FOR SELECT
  TO authenticated USING (public.v2_is_org_member(org_id));

-- A member creates/edits/removes only their own RSVP (and must be an org member).
CREATE POLICY "v2_ep_manage_own" ON public.v2_event_participants FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.v2_is_org_member(org_id))
  WITH CHECK (user_id = auth.uid() AND public.v2_is_org_member(org_id));

-- Org admins manage anyone's RSVP.
CREATE POLICY "v2_ep_admin" ON public.v2_event_participants FOR ALL
  TO authenticated
  USING (public.v2_is_org_admin(org_id))
  WITH CHECK (public.v2_is_org_admin(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_event_participants
  TO authenticated, service_role;
