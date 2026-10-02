-- 00252_v2_contest_enrollment_exclusions.sql
-- Opt-out tombstone for contest enrollment (#215, epic #214). Ports v1's
-- contest_enrollment_exclusions (migration 00165).
--
-- Why: Included contests (v2_contests.auto_enroll=true) auto-enroll every on-roster
-- member. When an admin deliberately pulls one person from such a contest — e.g. a
-- member who attended but left early and can't play Saturday's round — we must NOT
-- silently re-add them on the next attendance sync. This table records that explicit
-- removal so the additive enroll skips them until they're explicitly re-added (which
-- clears the tombstone). Distinct from a full roster leave.
--
-- Participation is independent of attendance: a member stays on_roster while being
-- excluded from a specific contest.

DROP TABLE IF EXISTS public.v2_contest_enrollment_exclusions CASCADE;

CREATE TABLE public.v2_contest_enrollment_exclusions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id  UUID NOT NULL REFERENCES public.v2_contests(id)  ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.v2_profiles(id)  ON DELETE CASCADE,
  removed_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  reason      TEXT,
  removed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contest_id, user_id)
);
CREATE INDEX idx_v2_contest_exclusions_user ON public.v2_contest_enrollment_exclusions(user_id);

-- Permissive RLS, API-gated writes (mirrors the rest of the v2 contest tables).
ALTER TABLE public.v2_contest_enrollment_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_contest_exclusions_all" ON public.v2_contest_enrollment_exclusions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_contest_enrollment_exclusions
  TO authenticated, service_role;
