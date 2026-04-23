-- Per-hole handicap-index override for a contest, used on scramble days where
-- multiple tee colors are mixed (e.g., 6 red + 6 yellow + 6 white). The stock
-- course_holes.handicap_index assumes a single-tee round, so a hole that rates
-- as #2-hardest from the whites may be an easy birdie hole from the reds.
-- Admins enter overrides on the Setup accordion; scoring uses them only when
-- ALL 18 holes are overridden for the contest (all-or-nothing).

ALTER TABLE public.contest_hole_tees
  ADD COLUMN IF NOT EXISTS handicap_index_override SMALLINT;

ALTER TABLE public.contest_hole_tees
  DROP CONSTRAINT IF EXISTS contest_hole_tees_handicap_override_range;

ALTER TABLE public.contest_hole_tees
  ADD CONSTRAINT contest_hole_tees_handicap_override_range
  CHECK (
    handicap_index_override IS NULL
    OR (handicap_index_override BETWEEN 1 AND 18)
  );
