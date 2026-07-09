-- ===========================================
-- Attendance -> Contest Auto-Enrollment (issue #137)
--
-- Two pieces:
--   1. `contests.auto_enroll_attendees` — when true, every Loozer on the
--      trip roster (event_participants.on_roster=true) is auto-added to
--      the contest's participants. Used for blanket contests that don't
--      require an explicit opt-in: Calcutta, per-day Scramble, KGB Cup.
--   2. `contest_enrollment_exclusions` — tombstone of "this Loozer was
--      explicitly removed from this contest; don't auto-re-add them."
--      Survives contest_participants row deletion, so the attendance sync
--      can respect a manual de-enroll without soft-deleting the live
--      roster row (which also carries Calcutta bid/ownership state).
-- ===========================================

-- 1. Blanket-enroll flag on contests
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS auto_enroll_attendees BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Manual de-enrollment tombstone
DROP TABLE IF EXISTS public.contest_enrollment_exclusions;
CREATE TABLE public.contest_enrollment_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  removed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  UNIQUE(contest_id, user_id)
);

CREATE INDEX idx_contest_exclusions_contest ON public.contest_enrollment_exclusions(contest_id);
CREATE INDEX idx_contest_exclusions_user ON public.contest_enrollment_exclusions(user_id);

ALTER TABLE public.contest_enrollment_exclusions ENABLE ROW LEVEL SECURITY;

-- Read is harmless (it just marks who opted out of a contest); writes are
-- server-only via the service role in the attendance-sync helper.
CREATE POLICY "Authenticated can read contest_enrollment_exclusions"
  ON public.contest_enrollment_exclusions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage contest_enrollment_exclusions"
  ON public.contest_enrollment_exclusions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contest_enrollment_exclusions
  TO authenticated, service_role;

-- 3. Turn blanket enrollment on for the contest types that everyone plays
--    on live + sandbox trips. Historical (archived) trips stay frozen.
--    scramble_skins is deliberately excluded — it's a paid opt-in that
--    lives inside a Scramble day, not a blanket contest.
UPDATE public.contests
SET auto_enroll_attendees = TRUE
WHERE contest_type IN ('calcutta', 'scramble', 'ryder_cup')
  AND trip_id IN (
    SELECT id FROM public.trip_settings WHERE status IN ('active', 'test')
  );
