-- ===========================================
-- Add GPS coordinates for tee and green per hole
-- Admins can mark these on a map view
-- ===========================================

ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS tee_latitude DECIMAL(10, 7);
ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS tee_longitude DECIMAL(10, 7);
ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS green_latitude DECIMAL(10, 7);
ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS green_longitude DECIMAL(10, 7);
