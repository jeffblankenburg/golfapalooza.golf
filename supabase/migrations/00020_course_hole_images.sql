-- Add image URL columns to course_holes for overhead and green contour views
ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS overhead_image_url TEXT;
ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS green_image_url TEXT;

-- Add a course_id column to trip_settings to link a trip to its course
ALTER TABLE trip_settings ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES courses(id);
