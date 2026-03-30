-- Relax hard-coded day_number CHECK constraints to support configurable event days.
-- Previously enforced BETWEEN 2 AND 4, now allows any positive day number.

ALTER TABLE hundred_feet_scores DROP CONSTRAINT IF EXISTS hundred_feet_scores_day_number_check;
ALTER TABLE hundred_feet_scores ADD CONSTRAINT hundred_feet_scores_day_number_check
  CHECK (day_number >= 1);

ALTER TABLE daily_contest_winners DROP CONSTRAINT IF EXISTS daily_contest_winners_day_number_check;
ALTER TABLE daily_contest_winners ADD CONSTRAINT daily_contest_winners_day_number_check
  CHECK (day_number >= 1);
