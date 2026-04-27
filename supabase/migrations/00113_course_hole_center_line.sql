-- Adds an optional polyline that defines a hole's playable corridor — the
-- ordered path from tee through any aim points / dogleg corners to the
-- green. Used by the player-facing satellite map to make the shape of the
-- hole obvious without forcing the renderer to infer it from tee/drive/
-- green points alone.
--
-- Stored as a jsonb array of [lat, lng] pairs:
--   [[40.0001, -83.0001], [40.0010, -83.0008], [40.0020, -83.0010]]
-- Null or empty array means "no center line set".

ALTER TABLE course_holes
  ADD COLUMN IF NOT EXISTS center_line jsonb;

COMMENT ON COLUMN course_holes.center_line IS
  'Ordered polyline of [lat, lng] points defining the playable corridor (tee → aim points → green). Null when not set.';
