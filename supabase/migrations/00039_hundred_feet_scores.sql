-- 100 Feet contest: per-player distance from pin on hole #18 each scramble day
-- Miss the green = 100 feet. Lower cumulative distance wins.

DROP TABLE IF EXISTS hundred_feet_scores;

CREATE TABLE hundred_feet_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_number SMALLINT NOT NULL CHECK (day_number BETWEEN 2 AND 4),
  feet SMALLINT NOT NULL DEFAULT 100 CHECK (feet BETWEEN 0 AND 100),
  inches SMALLINT NOT NULL DEFAULT 0 CHECK (inches BETWEEN 0 AND 11),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trip_id, user_id, day_number)
);

-- RLS: authenticated can read, admin writes via service role
ALTER TABLE hundred_feet_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read hundred_feet_scores"
  ON hundred_feet_scores FOR SELECT
  TO authenticated
  USING (true);
