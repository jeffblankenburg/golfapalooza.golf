-- Ryder Cup team hierarchy: teams → pairs → foursomes

-- Two teams per Ryder Cup contest
CREATE TABLE IF NOT EXISTS public.ryder_cup_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  team_number INTEGER NOT NULL,
  team_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, team_number),
  CHECK(team_number IN (1, 2))
);

ALTER TABLE public.ryder_cup_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ryder cup teams"
  ON public.ryder_cup_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage ryder cup teams"
  ON public.ryder_cup_teams FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_ryder_cup_teams_contest ON public.ryder_cup_teams(contest_id);

-- Pairs within a team (two players per pair)
CREATE TABLE IF NOT EXISTS public.ryder_cup_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.ryder_cup_teams(id) ON DELETE CASCADE,
  player_a_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  player_b_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ryder_cup_pairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ryder cup pairs"
  ON public.ryder_cup_pairs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage ryder cup pairs"
  ON public.ryder_cup_pairs FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_ryder_cup_pairs_team ON public.ryder_cup_pairs(team_id);

-- Foursomes: one pair from each team
CREATE TABLE IF NOT EXISTS public.ryder_cup_foursomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  pair_team1_id UUID NOT NULL REFERENCES public.ryder_cup_pairs(id) ON DELETE CASCADE,
  pair_team2_id UUID NOT NULL REFERENCES public.ryder_cup_pairs(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ryder_cup_foursomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ryder cup foursomes"
  ON public.ryder_cup_foursomes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage ryder cup foursomes"
  ON public.ryder_cup_foursomes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_ryder_cup_foursomes_contest ON public.ryder_cup_foursomes(contest_id);
CREATE INDEX idx_ryder_cup_foursomes_pair1 ON public.ryder_cup_foursomes(pair_team1_id);
CREATE INDEX idx_ryder_cup_foursomes_pair2 ON public.ryder_cup_foursomes(pair_team2_id);

-- Auto-seed two teams for any existing ryder_cup contest
INSERT INTO public.ryder_cup_teams (contest_id, team_number, team_name)
SELECT c.id, t.team_number, CASE t.team_number WHEN 1 THEN 'Team 1' WHEN 2 THEN 'Team 2' END
FROM public.contests c
CROSS JOIN (VALUES (1), (2)) AS t(team_number)
WHERE c.contest_type = 'ryder_cup'
  AND NOT EXISTS (
    SELECT 1 FROM public.ryder_cup_teams rt
    WHERE rt.contest_id = c.id AND rt.team_number = t.team_number
  );
