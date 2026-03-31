-- Live scoring: add verification columns to scramble_teams
-- and RLS policies for team member scoring

-- Add verification tracking to scramble_teams
ALTER TABLE scramble_teams ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE scramble_teams ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Team members can read/write their team's hole scores (only if team is unverified)
DROP POLICY IF EXISTS "Team members can manage unverified hole scores" ON public.scramble_hole_scores;
CREATE POLICY "Team members can manage unverified hole scores"
  ON public.scramble_hole_scores FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scramble_team_members stm
      JOIN scramble_teams st ON st.id = stm.team_id
      WHERE stm.team_id = scramble_hole_scores.team_id
        AND stm.user_id = auth.uid()
        AND st.verified_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scramble_team_members stm
      JOIN scramble_teams st ON st.id = stm.team_id
      WHERE stm.team_id = scramble_hole_scores.team_id
        AND stm.user_id = auth.uid()
        AND st.verified_at IS NULL
    )
  );

-- Team members can read/write their team's bonus points (only if team is unverified)
DROP POLICY IF EXISTS "Team members can manage unverified bonus points" ON public.bspitw_bonus_points;
CREATE POLICY "Team members can manage unverified bonus points"
  ON public.bspitw_bonus_points FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scramble_team_members stm
      JOIN scramble_teams st ON st.id = stm.team_id
      WHERE stm.team_id = bspitw_bonus_points.team_id
        AND stm.user_id = auth.uid()
        AND st.verified_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scramble_team_members stm
      JOIN scramble_teams st ON st.id = stm.team_id
      WHERE stm.team_id = bspitw_bonus_points.team_id
        AND stm.user_id = auth.uid()
        AND st.verified_at IS NULL
    )
  );
