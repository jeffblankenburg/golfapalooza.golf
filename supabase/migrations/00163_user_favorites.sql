-- Favorite Loozers (issue #140).
--
-- A one-way, silent relationship: `user_id` favorites `favorite_user_id`.
-- Favoriting drives per-favorite push notifications when the favorited Loozer
-- plays — three independently-toggled events:
--   notify_round_started   ("Rounds Played")        -- they start a live round
--   notify_hole_completed  ("Hole-by-Hole Updates") -- they card a hole
--   notify_round_completed ("Round Finished")        -- they finish, with score
--
-- Silent: the favorited person is NEVER told and can't see who favorited them.
-- That privacy is enforced two ways: RLS restricts every row to its owner
-- (user_id = auth.uid()), and the notification fan-out runs server-side via the
-- service role, so `favorite_user_id` is only ever read with elevated creds.

CREATE TABLE IF NOT EXISTS public.user_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  favorite_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  notify_round_started boolean NOT NULL DEFAULT true,
  notify_hole_completed boolean NOT NULL DEFAULT true,
  notify_round_completed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, favorite_user_id),
  CHECK (user_id <> favorite_user_id)
);

-- Fan-out lookup: "who favorited this player (with event X on)?"
CREATE INDEX IF NOT EXISTS idx_user_favorites_favorite
  ON public.user_favorites (favorite_user_id);

-- ============================================================================
-- RLS — a row is private to its owner (the favoriter). Nobody else, not even
-- the favorited person, may read it. Server fan-out uses the service role,
-- which bypasses RLS.
-- ============================================================================

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own favorites" ON public.user_favorites;
CREATE POLICY "Users can read own favorites"
  ON public.user_favorites FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can add own favorites" ON public.user_favorites;
CREATE POLICY "Users can add own favorites"
  ON public.user_favorites FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND user_id <> favorite_user_id);

DROP POLICY IF EXISTS "Users can update own favorites" ON public.user_favorites;
CREATE POLICY "Users can update own favorites"
  ON public.user_favorites FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own favorites" ON public.user_favorites;
CREATE POLICY "Users can remove own favorites"
  ON public.user_favorites FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_favorites TO authenticated, service_role;
