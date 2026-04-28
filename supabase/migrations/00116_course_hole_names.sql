-- Add optional per-hole names (e.g., "Azalea") to course_holes.
-- Surfaced in the live scoring view's header when present.

ALTER TABLE course_holes
  ADD COLUMN IF NOT EXISTS hole_name TEXT;
