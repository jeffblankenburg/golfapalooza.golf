-- Daily contest winners: closest to pin and long putt for each scramble day

DROP TABLE IF EXISTS daily_contest_winners;

CREATE TABLE daily_contest_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trip_settings(id) ON DELETE CASCADE,
  day_number SMALLINT NOT NULL CHECK (day_number BETWEEN 2 AND 4),
  contest_type VARCHAR(20) NOT NULL CHECK (contest_type IN ('ctp', 'long_putt')),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trip_id, day_number, contest_type)
);

-- RLS: authenticated can read, admin writes via service role
ALTER TABLE daily_contest_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read daily_contest_winners"
  ON daily_contest_winners FOR SELECT
  TO authenticated
  USING (true);
