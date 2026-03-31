-- Scoring lifecycle: contest-level close + verify columns and updated RLS policies

-- ===========================================
-- 1. Add scoring lifecycle columns to contests
-- ===========================================
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS scoring_closed_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS scoring_closed_by UUID REFERENCES public.users(id) ON DELETE SET NULL DEFAULT NULL;
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL DEFAULT NULL;

-- ===========================================
-- 2. Update KGB Cup hole scores RLS: block user writes when contest scoring is closed
-- ===========================================

-- Drop existing player policies (from 00056)
DROP POLICY IF EXISTS "Players can upsert scores for their foursomes" ON public.kgb_cup_hole_scores;
DROP POLICY IF EXISTS "Players can update scores for their foursomes" ON public.kgb_cup_hole_scores;

-- Recreate with contest close check
CREATE POLICY "Players can insert scores for open foursomes"
  ON public.kgb_cup_hole_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ryder_cup_foursomes f
      JOIN public.ryder_cup_pairs p1 ON p1.id = f.pair_team1_id
      JOIN public.ryder_cup_pairs p2 ON p2.id = f.pair_team2_id
      WHERE f.id = foursome_id
        AND (
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid()
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.contests c
      JOIN public.ryder_cup_foursomes f ON f.contest_id = c.id
      WHERE f.id = foursome_id
        AND c.scoring_closed_at IS NOT NULL
    )
  );

CREATE POLICY "Players can update scores for open foursomes"
  ON public.kgb_cup_hole_scores
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ryder_cup_foursomes f
      JOIN public.ryder_cup_pairs p1 ON p1.id = f.pair_team1_id
      JOIN public.ryder_cup_pairs p2 ON p2.id = f.pair_team2_id
      WHERE f.id = foursome_id
        AND (
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid()
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.contests c
      JOIN public.ryder_cup_foursomes f ON f.contest_id = c.id
      WHERE f.id = foursome_id
        AND c.scoring_closed_at IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ryder_cup_foursomes f
      JOIN public.ryder_cup_pairs p1 ON p1.id = f.pair_team1_id
      JOIN public.ryder_cup_pairs p2 ON p2.id = f.pair_team2_id
      WHERE f.id = foursome_id
        AND (
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid()
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.contests c
      JOIN public.ryder_cup_foursomes f ON f.contest_id = c.id
      WHERE f.id = foursome_id
        AND c.scoring_closed_at IS NOT NULL
    )
  );

-- ===========================================
-- 3. Update scramble RLS: also check contest close status
-- ===========================================

-- Drop existing team member policies (from 00054)
DROP POLICY IF EXISTS "Team members can manage unverified hole scores" ON public.scramble_hole_scores;
DROP POLICY IF EXISTS "Team members can manage unverified bonus points" ON public.bspitw_bonus_points;

-- Recreate with contest close check + existing team verify check
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
    AND NOT EXISTS (
      SELECT 1 FROM contests c
      JOIN scramble_teams st ON st.contest_id = c.id
      WHERE st.id = scramble_hole_scores.team_id
        AND c.scoring_closed_at IS NOT NULL
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
    AND NOT EXISTS (
      SELECT 1 FROM contests c
      JOIN scramble_teams st ON st.contest_id = c.id
      WHERE st.id = scramble_hole_scores.team_id
        AND c.scoring_closed_at IS NOT NULL
    )
  );

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
    AND NOT EXISTS (
      SELECT 1 FROM contests c
      JOIN scramble_teams st ON st.contest_id = c.id
      WHERE st.id = bspitw_bonus_points.team_id
        AND c.scoring_closed_at IS NOT NULL
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
    AND NOT EXISTS (
      SELECT 1 FROM contests c
      JOIN scramble_teams st ON st.contest_id = c.id
      WHERE st.id = bspitw_bonus_points.team_id
        AND c.scoring_closed_at IS NOT NULL
    )
  );
