-- 00171_contests_bracket_locked.sql
-- Adds a per-contest "bracket structure lock" flag. Distinct from:
--   - winners_locked_at   (tournament resolved; disables advancing winners)
--   - bracket_published_at (player visibility gate)
-- bracket_locked_at guards the generated bracket against accidental
-- Regenerate/Reset while the tournament is still being played. When set,
-- the generate (POST) and reset (DELETE) endpoints reject with 409, but
-- advancing match winners stays fully enabled. Null = unlocked.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS bracket_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contests.bracket_locked_at IS
  'Null = bracket unlocked; timestamp = locked-at moment. Blocks regenerate/reset of cornhole brackets while still allowing winner advancement.';
