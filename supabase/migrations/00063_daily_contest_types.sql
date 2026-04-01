-- Expand daily contest types:
--   ctp → ctp_front + ctp_back (Closest to Pin split by nine)
--   long_drive (new)
--   long_putt (unchanged)

-- Migrate existing ctp winners to ctp_front
UPDATE daily_contest_winners SET contest_type = 'ctp_front' WHERE contest_type = 'ctp';

-- Drop and recreate the constraint with new allowed values
ALTER TABLE daily_contest_winners
  DROP CONSTRAINT IF EXISTS daily_contest_winners_contest_type_check;

ALTER TABLE daily_contest_winners
  ADD CONSTRAINT daily_contest_winners_contest_type_check
  CHECK (contest_type IN ('ctp_front', 'ctp_back', 'long_drive', 'long_putt'));
