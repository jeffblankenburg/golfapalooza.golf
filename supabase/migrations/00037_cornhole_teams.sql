-- Cornhole doubles teams (partner pairings per cornhole_doubles contest)
CREATE TABLE IF NOT EXISTS public.cornhole_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.cornhole_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cornhole teams"
  ON public.cornhole_teams FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage cornhole teams"
  ON public.cornhole_teams FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_cornhole_teams_contest ON public.cornhole_teams(contest_id);

-- Cornhole team members (players assigned to teams, max 2 per team)
CREATE TABLE IF NOT EXISTS public.cornhole_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.cornhole_teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

ALTER TABLE public.cornhole_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cornhole team members"
  ON public.cornhole_team_members FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage cornhole team members"
  ON public.cornhole_team_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_cornhole_team_members_team ON public.cornhole_team_members(team_id);
CREATE INDEX idx_cornhole_team_members_user ON public.cornhole_team_members(user_id);
