-- 00285_v2_tournament_team_record.sql
-- #226/#227: carry each team's season W-L record on the tournament field so the
-- auction/bracket UI can show "how good is this team" (e.g. "31-4") next to the seed
-- and logo. Snapshotted at import time from the ESPN scoreboard (overall record).
--
-- Table-level grants from 00283 already cover new columns, so no new GRANT is needed.

ALTER TABLE public.v2_tournament_teams ADD COLUMN IF NOT EXISTS record TEXT;

COMMENT ON COLUMN public.v2_tournament_teams.record IS
  'Season win-loss record at import time (e.g. "31-4"); display-only, not recomputed.';
