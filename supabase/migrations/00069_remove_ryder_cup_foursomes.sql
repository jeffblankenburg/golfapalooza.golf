-- Remove ryder_cup_foursomes table — foursomes are now derived from pairs by matching sort_order.
-- The "foursome ID" = team1 pair's ID (deterministic).

-- ===========================================
-- 1. Drop RLS policies on kgb_cup_hole_scores that reference ryder_cup_foursomes
-- ===========================================
DROP POLICY IF EXISTS "Players can insert scores for open foursomes" ON public.kgb_cup_hole_scores;
DROP POLICY IF EXISTS "Players can update scores for open foursomes" ON public.kgb_cup_hole_scores;

-- ===========================================
-- 2. Drop FK from kgb_cup_hole_scores.foursome_id → ryder_cup_foursomes
-- ===========================================
ALTER TABLE public.kgb_cup_hole_scores
  DROP CONSTRAINT IF EXISTS kgb_cup_hole_scores_foursome_id_fkey;

-- ===========================================
-- 3. Drop kgb_foursome_id column from tee_times
-- ===========================================
ALTER TABLE public.tee_times
  DROP COLUMN IF EXISTS kgb_foursome_id;

-- ===========================================
-- 4. Drop ryder_cup_foursomes table
-- ===========================================
DROP TABLE IF EXISTS public.ryder_cup_foursomes;

-- ===========================================
-- 5. Recreate RLS policies on kgb_cup_hole_scores using pairs directly.
--    foursome_id now = team1 pair ID. A user can score if they belong to
--    either that pair or the opposing pair (same sort_order, same contest).
-- ===========================================
CREATE POLICY "Players can insert scores for open foursomes"
  ON public.kgb_cup_hole_scores
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User is in the team1 pair (= foursome_id) or the matching team2 pair
    EXISTS (
      SELECT 1
      FROM public.ryder_cup_pairs p1
      JOIN public.ryder_cup_teams t1 ON t1.id = p1.team_id
      JOIN public.ryder_cup_teams t2 ON t2.contest_id = t1.contest_id AND t2.id != t1.id
      JOIN public.ryder_cup_pairs p2 ON p2.team_id = t2.id AND p2.sort_order = p1.sort_order
      WHERE p1.id = foursome_id
        AND (
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid()
        )
    )
    -- Contest scoring is not closed
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
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid()
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
          p1.player_a_id = auth.uid() OR p1.player_b_id = auth.uid()
          OR p2.player_a_id = auth.uid() OR p2.player_b_id = auth.uid()
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
