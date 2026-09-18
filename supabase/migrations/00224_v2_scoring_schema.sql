-- v2 personal scoring: rounds, players, hole scores, and the golfer's handicap.
--
-- PERSONAL & GLOBAL (like the original, NOT org-scoped): a golfer has ONE rounds
-- history + ONE handicap that follow them across every group they're in. Rounds
-- reference the universal v2 course library (v2_courses/tees/holes, which is also
-- global). Mirrors the legacy scoring schema (00002), adapted to v2: v2_profiles
-- instead of users, guest players (user_id XOR guest_name), and the
-- individual/scramble format flag. Co-equal ownership (no is_scorer) — any player
-- on a round can score/edit it; created_by is kept only for "Started by…".

-- ── Rounds — the scoring session ────────────────────────────────────────────
CREATE TABLE public.v2_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.v2_courses(id),
  tee_id UUID NOT NULL REFERENCES public.v2_course_tees(id),
  round_date DATE NOT NULL DEFAULT CURRENT_DATE,
  round_type VARCHAR(10) NOT NULL DEFAULT '18' CHECK (round_type IN ('9-front', '9-back', '18')),
  format VARCHAR(20) NOT NULL DEFAULT 'individual' CHECK (format IN ('individual', 'scramble')),
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  notes TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_v2_rounds_created_by ON public.v2_rounds (created_by);
CREATE INDEX idx_v2_rounds_date ON public.v2_rounds (round_date DESC);

-- ── Round players — a roster row is EITHER a member OR a guest ───────────────
CREATE TABLE public.v2_round_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.v2_rounds(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  guest_name TEXT,
  tee_id UUID NOT NULL REFERENCES public.v2_course_tees(id),
  player_position INTEGER,
  playing_handicap INTEGER,
  final_gross_score INTEGER,
  final_adjusted_score INTEGER,
  final_net_score INTEGER,
  score_differential DECIMAL(4, 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT v2_round_players_user_xor_guest CHECK (
    (user_id IS NOT NULL AND guest_name IS NULL) OR
    (user_id IS NULL AND guest_name IS NOT NULL)
  )
);
CREATE INDEX idx_v2_round_players_round ON public.v2_round_players (round_id);
CREATE INDEX idx_v2_round_players_user ON public.v2_round_players (user_id);
-- One row per member per round; guests are exempt (multiple guests allowed).
CREATE UNIQUE INDEX uq_v2_round_players_member
  ON public.v2_round_players (round_id, user_id) WHERE user_id IS NOT NULL;

-- ── Round scores — hole by hole, keyed off the round_player (guests included) ─
CREATE TABLE public.v2_round_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES public.v2_rounds(id) ON DELETE CASCADE,
  round_player_id UUID NOT NULL REFERENCES public.v2_round_players(id) ON DELETE CASCADE,
  hole_number INTEGER NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes INTEGER CHECK (strokes BETWEEN 1 AND 20),
  putts INTEGER CHECK (putts BETWEEN 0 AND 10),
  fairway_hit BOOLEAN,
  green_in_regulation BOOLEAN,
  penalty_strokes INTEGER DEFAULT 0,
  notes VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (round_player_id, hole_number)
);
CREATE INDEX idx_v2_round_scores_round ON public.v2_round_scores (round_id);
CREATE INDEX idx_v2_round_scores_player ON public.v2_round_scores (round_player_id);

-- ── Player handicaps — one per golfer (USGA index over best 8 of last 20) ────
CREATE TABLE public.v2_player_handicaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  handicap_index DECIMAL(3, 1),
  low_handicap_index DECIMAL(3, 1),
  rounds_used INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  effective_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_v2_player_handicaps_user ON public.v2_player_handicaps (user_id);

-- Personal data reached only through API routes (gated by the authed user);
-- permissive RLS + explicit grants, mirroring the rest of v2.
ALTER TABLE public.v2_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_round_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_round_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_player_handicaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_rounds_all" ON public.v2_rounds FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_round_players_all" ON public.v2_round_players FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_round_scores_all" ON public.v2_round_scores FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_player_handicaps_all" ON public.v2_player_handicaps FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_rounds TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_round_players TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_round_scores TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_player_handicaps TO authenticated, service_role;
