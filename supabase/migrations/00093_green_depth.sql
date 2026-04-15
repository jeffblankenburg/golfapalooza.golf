-- Add front/back green markers for green depth measurement
ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS green_front_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS green_front_longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS green_back_latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS green_back_longitude DOUBLE PRECISION;
