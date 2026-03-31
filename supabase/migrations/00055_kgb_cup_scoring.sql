-- KGB Cup scoring tables: player handicap snapshots, pair scramble handicaps, and hole scores

-- ===========================================
-- KGB CUP PLAYER HANDICAPS (snapshot of adjusted handicaps)
-- ===========================================
DROP TABLE IF EXISTS public.kgb_cup_player_handicaps;

CREATE TABLE IF NOT EXISTS public.kgb_cup_player_handicaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  original_handicap NUMERIC(4,1),
  adjusted_handicap SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, player_id)
);

CREATE INDEX idx_kgb_cup_player_handicaps_contest ON public.kgb_cup_player_handicaps(contest_id);

ALTER TABLE public.kgb_cup_player_handicaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read kgb_cup_player_handicaps"
  ON public.kgb_cup_player_handicaps
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage kgb_cup_player_handicaps"
  ON public.kgb_cup_player_handicaps
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE TRIGGER kgb_cup_player_handicaps_updated_at
  BEFORE UPDATE ON public.kgb_cup_player_handicaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- KGB CUP PAIR HANDICAPS (admin-assigned scramble handicap per pair)
-- ===========================================
DROP TABLE IF EXISTS public.kgb_cup_pair_handicaps;

CREATE TABLE IF NOT EXISTS public.kgb_cup_pair_handicaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  pair_id UUID NOT NULL REFERENCES public.ryder_cup_pairs(id) ON DELETE CASCADE,
  scramble_handicap SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, pair_id)
);

CREATE INDEX idx_kgb_cup_pair_handicaps_contest ON public.kgb_cup_pair_handicaps(contest_id);

ALTER TABLE public.kgb_cup_pair_handicaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read kgb_cup_pair_handicaps"
  ON public.kgb_cup_pair_handicaps
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage kgb_cup_pair_handicaps"
  ON public.kgb_cup_pair_handicaps
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE TRIGGER kgb_cup_pair_handicaps_updated_at
  BEFORE UPDATE ON public.kgb_cup_pair_handicaps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- KGB CUP HOLE SCORES (polymorphic: individual or pair scramble)
-- ===========================================
DROP TABLE IF EXISTS public.kgb_cup_hole_scores;

CREATE TABLE IF NOT EXISTS public.kgb_cup_hole_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  foursome_id UUID NOT NULL REFERENCES public.ryder_cup_foursomes(id) ON DELETE CASCADE,
  hole_number SMALLINT NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  scorer_type TEXT NOT NULL CHECK (scorer_type IN ('player', 'pair')),
  scorer_id UUID NOT NULL,
  strokes SMALLINT NOT NULL CHECK (strokes >= 1 AND strokes <= 20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(foursome_id, hole_number, scorer_type, scorer_id)
);

CREATE INDEX idx_kgb_cup_hole_scores_foursome ON public.kgb_cup_hole_scores(foursome_id);

ALTER TABLE public.kgb_cup_hole_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read kgb_cup_hole_scores"
  ON public.kgb_cup_hole_scores
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage kgb_cup_hole_scores"
  ON public.kgb_cup_hole_scores
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

CREATE TRIGGER kgb_cup_hole_scores_updated_at
  BEFORE UPDATE ON public.kgb_cup_hole_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
