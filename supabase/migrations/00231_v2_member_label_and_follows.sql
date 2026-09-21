-- 00231_v2_member_label_and_follows.sql
-- Phase 1 of follow-a-member (#187):
--   1. Per-org configurable "member" label (like the per-org system name). Each
--      group names its people; default "Member"/"Members". Golfapalooza = Loozer(s).
--   2. Follow-a-member model — who follows whom, with per-follow toggles for the
--      three spectator notifications.

-- 1) Member label.
ALTER TABLE public.v2_organizations
  ADD COLUMN IF NOT EXISTS member_noun TEXT NOT NULL DEFAULT 'Member',
  ADD COLUMN IF NOT EXISTS member_noun_plural TEXT NOT NULL DEFAULT 'Members';

UPDATE public.v2_organizations
SET member_noun = 'Loozer', member_noun_plural = 'Loozers'
WHERE slug = 'golfapalooza';

-- 2) Follows ("favorite" a member). Global (you follow a person, not a person in
--    a group); per-follow toggles gate WHICH spectator notifications you get.
DROP TABLE IF EXISTS public.v2_user_favorites;
CREATE TABLE public.v2_user_favorites (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id            uuid NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  favorite_user_id       uuid NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  notify_round_started   BOOLEAN NOT NULL DEFAULT true,
  notify_hole_completed  BOOLEAN NOT NULL DEFAULT true,
  notify_round_completed BOOLEAN NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, favorite_user_id),
  CHECK (follower_id <> favorite_user_id)
);
CREATE INDEX idx_v2_user_favorites_follower ON public.v2_user_favorites (follower_id);
CREATE INDEX idx_v2_user_favorites_favorite ON public.v2_user_favorites (favorite_user_id);

ALTER TABLE public.v2_user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_user_favorites_all" ON public.v2_user_favorites FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_user_favorites TO authenticated, service_role;
