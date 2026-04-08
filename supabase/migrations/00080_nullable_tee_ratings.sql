-- ===========================================
-- Make course_rating and slope_rating nullable
-- Some courses don't have official ratings
-- ===========================================

ALTER TABLE course_tees ALTER COLUMN course_rating DROP NOT NULL;
ALTER TABLE course_tees ALTER COLUMN slope_rating DROP NOT NULL;

-- Also drop the slope range check so null is allowed cleanly
ALTER TABLE course_tees DROP CONSTRAINT IF EXISTS course_tees_slope_rating_check;
ALTER TABLE course_tees ADD CONSTRAINT course_tees_slope_rating_check
  CHECK (slope_rating IS NULL OR slope_rating BETWEEN 55 AND 155);
