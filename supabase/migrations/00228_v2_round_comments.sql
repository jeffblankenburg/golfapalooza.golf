-- 00228_v2_round_comments.sql
-- Live comments on a v2 round (mirrors legacy round_comments, issue #140) so the
-- group can chatter while scoring. Permissive RLS + grants + realtime, matching
-- the rest of the v2 scoring subsystem (00224).

DROP TABLE IF EXISTS public.v2_round_comments;

CREATE TABLE public.v2_round_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id   uuid NOT NULL REFERENCES public.v2_rounds(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (length(body) > 0 AND length(body) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_v2_round_comments_round_created
  ON public.v2_round_comments (round_id, created_at ASC);

ALTER TABLE public.v2_round_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_round_comments_all" ON public.v2_round_comments FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_round_comments TO authenticated, service_role;

-- Realtime: publish + full old row on DELETE (so the round_id filter matches).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_round_comments;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.v2_round_comments REPLICA IDENTITY FULL;
