-- 00162_round_format.sql
-- Adds a `format` column to `rounds` distinguishing individual play (everyone
-- plays their own ball; WHS handicap-eligible) from scramble team play (the
-- whole group plays one team ball; excluded from handicap).
--
-- `format` is ORTHOGONAL to `round_type`: round_type continues to encode hole
-- count (18 / 9-front / 9-back) and drives par/scorecard display, while format
-- drives team scoring + handicap exclusion. Existing rows default to
-- 'individual', so the handicap-gathering query (which now filters
-- format='individual') keeps counting every historical round exactly as before.
--
-- Grants already exist on `rounds` from 00002; no re-grant needed.

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS format VARCHAR(20) NOT NULL DEFAULT 'individual';

ALTER TABLE rounds DROP CONSTRAINT IF EXISTS rounds_format_check;
ALTER TABLE rounds ADD CONSTRAINT rounds_format_check
  CHECK (format IN ('individual', 'scramble'));
