-- Scramble teams (team compositions per scramble contest day)
CREATE TABLE IF NOT EXISTS public.scramble_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  team_handicap INTEGER DEFAULT 0,
  gross_score INTEGER,
  course_par INTEGER NOT NULL DEFAULT 72,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.scramble_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scramble teams"
  ON public.scramble_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage scramble teams"
  ON public.scramble_teams FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_scramble_teams_contest ON public.scramble_teams(contest_id);

-- Scramble team members (players assigned to teams)
CREATE TABLE IF NOT EXISTS public.scramble_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.scramble_teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.scramble_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scramble team members"
  ON public.scramble_team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage scramble team members"
  ON public.scramble_team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_scramble_team_members_team ON public.scramble_team_members(team_id);
CREATE INDEX idx_scramble_team_members_user ON public.scramble_team_members(user_id);
