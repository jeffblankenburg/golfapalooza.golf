-- 00170_contests_bracket_published.sql
-- Adds a per-contest "bracket published" visibility flag, mirroring
-- tee_sheet_published_at (migration 00117). Null = hidden from players,
-- timestamp = published-at moment. Gates the public /api/cornhole/bracket
-- endpoint so admins can build/seed a cornhole bracket before revealing it.
-- Applies to cornhole_singles and cornhole_doubles contests.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS bracket_published_at TIMESTAMPTZ;

COMMENT ON COLUMN public.contests.bracket_published_at IS
  'Null = bracket hidden from players; timestamp = published-at moment. Gates /api/cornhole/bracket.';
