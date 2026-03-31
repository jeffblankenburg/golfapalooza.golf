-- KGB Cup enhancements: team colors, tee_times default, and user scoring RLS

-- ===========================================
-- 1. Add team_color to ryder_cup_teams
-- ===========================================
ALTER TABLE public.ryder_cup_teams
  ADD COLUMN IF NOT EXISTS team_color TEXT DEFAULT NULL;

-- ===========================================
-- 2. Default starting_hole to 1 for tee_times
-- ===========================================
ALTER TABLE public.tee_times
  ALTER COLUMN starting_hole SET DEFAULT 1;

-- ===========================================
-- 3. RLS policy: authenticated users can INSERT/UPDATE scores for their own foursomes
-- ===========================================
CREATE POLICY "Players can upsert scores for their foursomes"
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
  );

CREATE POLICY "Players can update scores for their foursomes"
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
  );
