-- Fix infinite recursion in RLS policies (SELECT only)
-- The issue: rounds policy checks round_players, round_players policy checks rounds

-- Drop the problematic policies
DROP POLICY IF EXISTS "Users can read rounds they created or play in" ON rounds;
DROP POLICY IF EXISTS "Users can read round_players in their rounds" ON round_players;
DROP POLICY IF EXISTS "Users can read scores in their rounds" ON round_scores;

-- Simplified rounds policy - just check created_by, let the function handle player check
CREATE POLICY "Users can read their rounds" ON rounds
  FOR SELECT USING (
    created_by = auth.uid() OR
    id IN (SELECT round_id FROM round_players WHERE user_id = auth.uid())
  );

-- Simplified round_players policy - check if user is the player OR created the round
CREATE POLICY "Users can read round_players" ON round_players
  FOR SELECT USING (
    user_id = auth.uid() OR
    round_id IN (SELECT id FROM rounds WHERE created_by = auth.uid())
  );

-- Simplified round_scores policy
CREATE POLICY "Users can read scores" ON round_scores
  FOR SELECT USING (
    round_player_id IN (
      SELECT id FROM round_players WHERE user_id = auth.uid()
    ) OR
    round_id IN (SELECT id FROM rounds WHERE created_by = auth.uid())
  );
