-- Live round comments (issue #140).
--
-- Any signed-in Loozer can comment on ANY round, at ANY time — there is NO
-- round-status gate. Comment mid-round to razz a birdie, or years later on a
-- historical card. Mirrors the gallery_comments pattern (00043) and rides the
-- same supabase_realtime publication so watchers see comments stream in live.

CREATE TABLE IF NOT EXISTS public.round_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) > 0 AND length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_round_comments_round_created
  ON public.round_comments (round_id, created_at ASC);

-- ============================================================================
-- RLS — any authenticated Loozer reads all comments; insert/delete your own;
-- admins may delete any. No status gate anywhere.
-- ============================================================================

ALTER TABLE public.round_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read round comments" ON public.round_comments;
CREATE POLICY "Authenticated users can read round comments"
  ON public.round_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can add round comments" ON public.round_comments;
CREATE POLICY "Authenticated users can add round comments"
  ON public.round_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Senders and admins can remove round comments" ON public.round_comments;
CREATE POLICY "Senders and admins can remove round comments"
  ON public.round_comments FOR DELETE TO authenticated
  USING (
    auth.uid() = sender_id
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- ============================================================================
-- REALTIME — add to the publication so subscribeToRound() can route inserts.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'round_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_comments;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.round_comments TO authenticated, service_role;
