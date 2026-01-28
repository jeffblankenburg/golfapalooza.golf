-- ===========================================
-- COURSES TABLE (cached from GolfCourseAPI)
-- ===========================================
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(100) UNIQUE,
  name VARCHAR(200) NOT NULL,
  club_name VARCHAR(200),
  address VARCHAR(300),
  city VARCHAR(100),
  state VARCHAR(50),
  country VARCHAR(100) DEFAULT 'USA',
  postal_code VARCHAR(20),
  phone VARCHAR(30),
  website VARCHAR(300),
  latitude DECIMAL(10, 7),
  longitude DECIMAL(10, 7),
  hole_count INTEGER DEFAULT 18 CHECK (hole_count IN (9, 18)),
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_courses_external_id ON courses(external_id);
CREATE INDEX idx_courses_name ON courses(name);
CREATE INDEX idx_courses_location ON courses(city, state);

-- ===========================================
-- COURSE TEES TABLE (with ratings per tee)
-- ===========================================
CREATE TABLE public.course_tees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tee_name VARCHAR(50) NOT NULL,
  tee_color VARCHAR(20),
  gender VARCHAR(10) DEFAULT 'all' CHECK (gender IN ('men', 'women', 'all')),
  course_rating DECIMAL(4, 1) NOT NULL,
  slope_rating INTEGER NOT NULL CHECK (slope_rating BETWEEN 55 AND 155),
  front_nine_rating DECIMAL(4, 1),
  front_nine_slope INTEGER CHECK (front_nine_slope BETWEEN 55 AND 155),
  back_nine_rating DECIMAL(4, 1),
  back_nine_slope INTEGER CHECK (back_nine_slope BETWEEN 55 AND 155),
  total_yards INTEGER,
  total_meters INTEGER,
  par INTEGER NOT NULL DEFAULT 72,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(course_id, tee_name)
);

CREATE INDEX idx_course_tees_course ON course_tees(course_id);

-- ===========================================
-- COURSE HOLES TABLE (par, handicap index per hole)
-- ===========================================
CREATE TABLE public.course_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tee_id UUID NOT NULL REFERENCES course_tees(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  par INTEGER NOT NULL CHECK (par BETWEEN 3 AND 6),
  handicap_index INTEGER NOT NULL CHECK (handicap_index BETWEEN 1 AND 18),
  yards INTEGER,
  meters INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tee_id, hole_number)
);

CREATE INDEX idx_course_holes_tee ON course_holes(tee_id);
CREATE INDEX idx_course_holes_course ON course_holes(course_id);

-- ===========================================
-- ROUNDS TABLE (the scoring session)
-- ===========================================
CREATE TABLE public.rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id),
  tee_id UUID NOT NULL REFERENCES course_tees(id),
  round_date DATE NOT NULL DEFAULT CURRENT_DATE,
  round_type VARCHAR(10) NOT NULL DEFAULT '18' CHECK (round_type IN ('9-front', '9-back', '18')),
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  weather_conditions VARCHAR(100),
  notes TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rounds_created_by ON rounds(created_by);
CREATE INDEX idx_rounds_date ON rounds(round_date DESC);
CREATE INDEX idx_rounds_status ON rounds(status);

-- ===========================================
-- ROUND PLAYERS TABLE (who's in the foursome)
-- ===========================================
CREATE TABLE public.round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tee_id UUID NOT NULL REFERENCES course_tees(id),
  player_position INTEGER NOT NULL CHECK (player_position BETWEEN 1 AND 4),
  is_scorer BOOLEAN DEFAULT FALSE,
  playing_handicap INTEGER,
  final_gross_score INTEGER,
  final_adjusted_score INTEGER,
  final_net_score INTEGER,
  score_differential DECIMAL(4, 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_id, user_id),
  UNIQUE(round_id, player_position)
);

CREATE INDEX idx_round_players_round ON round_players(round_id);
CREATE INDEX idx_round_players_user ON round_players(user_id);

-- ===========================================
-- ROUND SCORES TABLE (hole-by-hole scores)
-- ===========================================
CREATE TABLE public.round_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  round_player_id UUID NOT NULL REFERENCES round_players(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes INTEGER CHECK (strokes BETWEEN 1 AND 20),
  putts INTEGER CHECK (putts BETWEEN 0 AND 10),
  fairway_hit BOOLEAN,
  green_in_regulation BOOLEAN,
  penalty_strokes INTEGER DEFAULT 0,
  notes VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(round_player_id, hole_number)
);

CREATE INDEX idx_round_scores_round ON round_scores(round_id);
CREATE INDEX idx_round_scores_player ON round_scores(round_player_id);

-- ===========================================
-- PLAYER HANDICAPS TABLE (calculated handicap data)
-- ===========================================
CREATE TABLE public.player_handicaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  handicap_index DECIMAL(3, 1),
  low_handicap_index DECIMAL(3, 1),
  rounds_used INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  effective_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_player_handicaps_user ON player_handicaps(user_id);

-- ===========================================
-- HANDICAP HISTORY TABLE (for tracking changes)
-- ===========================================
CREATE TABLE public.handicap_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handicap_index DECIMAL(3, 1) NOT NULL,
  rounds_used INTEGER NOT NULL,
  differentials_used JSONB,
  calculation_method VARCHAR(50),
  effective_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handicap_history_user ON handicap_history(user_id);
CREATE INDEX idx_handicap_history_date ON handicap_history(effective_date DESC);

-- ===========================================
-- ROW LEVEL SECURITY POLICIES
-- ===========================================

-- Courses: Anyone can read, admins can manage
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read courses" ON courses
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert courses" ON courses
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update courses" ON courses
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete courses" ON courses
  FOR DELETE USING (is_admin());

-- Course Tees: Same as courses
ALTER TABLE course_tees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read course_tees" ON course_tees
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert course_tees" ON course_tees
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update course_tees" ON course_tees
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete course_tees" ON course_tees
  FOR DELETE USING (is_admin());

-- Course Holes: Same as courses
ALTER TABLE course_holes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read course_holes" ON course_holes
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert course_holes" ON course_holes
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "Admins can update course_holes" ON course_holes
  FOR UPDATE USING (is_admin());

CREATE POLICY "Admins can delete course_holes" ON course_holes
  FOR DELETE USING (is_admin());

-- Rounds: Users can manage their own rounds
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read rounds they created or play in" ON rounds
  FOR SELECT USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM round_players
      WHERE round_players.round_id = rounds.id AND round_players.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create rounds" ON rounds
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Round creator can update" ON rounds
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Round creator can delete" ON rounds
  FOR DELETE USING (created_by = auth.uid());

-- Round Players: Users can read if they're in the round
ALTER TABLE round_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read round_players in their rounds" ON round_players
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM rounds r
      WHERE r.id = round_players.round_id
      AND (r.created_by = auth.uid() OR EXISTS (
        SELECT 1 FROM round_players rp2 WHERE rp2.round_id = r.id AND rp2.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Round creator can manage players" ON round_players
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM rounds WHERE id = round_id AND created_by = auth.uid())
  );

CREATE POLICY "Round creator can update players" ON round_players
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM rounds WHERE id = round_id AND created_by = auth.uid())
  );

CREATE POLICY "Round creator can delete players" ON round_players
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM rounds WHERE id = round_id AND created_by = auth.uid())
  );

-- Round Scores: Users can manage scores in their rounds
ALTER TABLE round_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read scores in their rounds" ON round_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE rp.id = round_scores.round_player_id
      AND (rp.user_id = auth.uid() OR r.created_by = auth.uid())
    )
  );

CREATE POLICY "Users can insert scores" ON round_scores
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE rp.id = round_player_id
      AND (rp.user_id = auth.uid() OR r.created_by = auth.uid() OR rp.is_scorer = true)
    )
  );

CREATE POLICY "Users can update scores" ON round_scores
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE rp.id = round_player_id
      AND (rp.user_id = auth.uid() OR r.created_by = auth.uid() OR rp.is_scorer = true)
    )
  );

CREATE POLICY "Users can delete scores" ON round_scores
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE rp.id = round_player_id
      AND (rp.user_id = auth.uid() OR r.created_by = auth.uid())
    )
  );

-- Player Handicaps: Users can read anyone's, manage their own
ALTER TABLE player_handicaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read handicaps" ON player_handicaps
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own handicap" ON player_handicaps
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own handicap" ON player_handicaps
  FOR UPDATE USING (user_id = auth.uid());

-- Handicap History: Anyone can read
ALTER TABLE handicap_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read handicap history" ON handicap_history
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own history" ON handicap_history
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ===========================================
-- TRIGGERS FOR updated_at
-- ===========================================

CREATE TRIGGER courses_updated_at
  BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER course_tees_updated_at
  BEFORE UPDATE ON course_tees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rounds_updated_at
  BEFORE UPDATE ON rounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER round_players_updated_at
  BEFORE UPDATE ON round_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER round_scores_updated_at
  BEFORE UPDATE ON round_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER player_handicaps_updated_at
  BEFORE UPDATE ON player_handicaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
