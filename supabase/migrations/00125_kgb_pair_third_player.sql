-- KGB Cup uneven team support (issue #107):
-- Allow up to 3 players per "pair" so 2v3 / 3v2 / 3v3 / 1v2 / 2v1 groups work.
-- Existing 2v2 rows are untouched (player_c_id stays NULL).

-- ===========================================
-- 1. Add nullable player_c_id column
-- ===========================================
ALTER TABLE public.ryder_cup_pairs
  ADD COLUMN IF NOT EXISTS player_c_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- ===========================================
-- 2. Recreate player-facing RLS policies on kgb_cup_hole_scores so they
--    authorize the third player slot too. The two policies below replace the
--    versions installed by 00069_remove_ryder_cup_foursomes.sql.
-- ===========================================
DROP POLICY IF EXISTS "Players can insert scores for open foursomes" ON public.kgb_cup_hole_scores;
DROP POLICY IF EXISTS "Players can update scores for open foursomes" ON public.kgb_cup_hole_scores;

CREATE POLICY "Players can insert scores for open foursomes"
  ON public.kgb_cup_hole_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ryder_cup_pairs p1
      JOIN public.ryder_cup_teams t1 ON t1.id = p1.team_id
      JOIN public.ryder_cup_teams t2 ON t2.contest_id = t1.contest_id AND t2.id != t1.id
      JOIN public.ryder_cup_pairs p2 ON p2.team_id = t2.id AND p2.sort_order = p1.sort_order
      WHERE p1.id = foursome_id
        AND (
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid() OR p1.player_c_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid() OR p2.player_c_id = auth.uid()
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ryder_cup_pairs p
      JOIN public.ryder_cup_teams t ON t.id = p.team_id
      JOIN public.contests c ON c.id = t.contest_id
      WHERE p.id = foursome_id
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
      FROM public.ryder_cup_pairs p1
      JOIN public.ryder_cup_teams t1 ON t1.id = p1.team_id
      JOIN public.ryder_cup_teams t2 ON t2.contest_id = t1.contest_id AND t2.id != t1.id
      JOIN public.ryder_cup_pairs p2 ON p2.team_id = t2.id AND p2.sort_order = p1.sort_order
      WHERE p1.id = foursome_id
        AND (
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid() OR p1.player_c_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid() OR p2.player_c_id = auth.uid()
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ryder_cup_pairs p
      JOIN public.ryder_cup_teams t ON t.id = p.team_id
      JOIN public.contests c ON c.id = t.contest_id
      WHERE p.id = foursome_id
        AND c.scoring_closed_at IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ryder_cup_pairs p1
      JOIN public.ryder_cup_teams t1 ON t1.id = p1.team_id
      JOIN public.ryder_cup_teams t2 ON t2.contest_id = t1.contest_id AND t2.id != t1.id
      JOIN public.ryder_cup_pairs p2 ON p2.team_id = t2.id AND p2.sort_order = p1.sort_order
      WHERE p1.id = foursome_id
        AND (
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid() OR p1.player_c_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid() OR p2.player_c_id = auth.uid()
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ryder_cup_pairs p
      JOIN public.ryder_cup_teams t ON t.id = p.team_id
      JOIN public.contests c ON c.id = t.contest_id
      WHERE p.id = foursome_id
        AND c.scoring_closed_at IS NOT NULL
    )
  );
