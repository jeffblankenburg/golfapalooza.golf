-- Add ideal drive landing point coordinates to course holes
ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS drive_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS drive_longitude DOUBLE PRECISION;
