-- Hole-by-hole scores for scramble teams
CREATE TABLE IF NOT EXISTS public.scramble_hole_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.scramble_teams(id) ON DELETE CASCADE,
  hole_number SMALLINT NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  strokes SMALLINT NOT NULL CHECK (strokes >= 1 AND strokes <= 20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, hole_number)
);

ALTER TABLE public.scramble_hole_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scramble hole scores"
  ON public.scramble_hole_scores FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage scramble hole scores"
  ON public.scramble_hole_scores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_scramble_hole_scores_team ON public.scramble_hole_scores(team_id);

CREATE TRIGGER scramble_hole_scores_updated_at
  BEFORE UPDATE ON public.scramble_hole_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- BSPITW bonus points per player per hole
CREATE TABLE IF NOT EXISTS public.bspitw_bonus_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.scramble_teams(id) ON DELETE CASCADE,
  hole_number SMALLINT NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  on_green BOOLEAN DEFAULT false,
  holed_out BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, hole_number, user_id)
);

ALTER TABLE public.bspitw_bonus_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bspitw bonus points"
  ON public.bspitw_bonus_points FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage bspitw bonus points"
  ON public.bspitw_bonus_points FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_bspitw_bonus_points_team ON public.bspitw_bonus_points(team_id);
CREATE INDEX idx_bspitw_bonus_points_user ON public.bspitw_bonus_points(user_id);

CREATE TRIGGER bspitw_bonus_points_updated_at
  BEFORE UPDATE ON public.bspitw_bonus_points
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
