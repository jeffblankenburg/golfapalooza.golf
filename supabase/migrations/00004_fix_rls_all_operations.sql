-- Fix infinite recursion in RLS policies for ALL operations (INSERT/UPDATE/DELETE)
-- The issue: policies that query other tables cause recursion when those tables have policies that query back
-- Solution: Use SECURITY DEFINER functions that bypass RLS

-- ============================================
-- STEP 1: Create SECURITY DEFINER functions
-- These bypass RLS when called from policies
-- ============================================

-- Check if user created a round (bypasses RLS)
CREATE OR REPLACE FUNCTION is_round_creator(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rounds
    WHERE id = p_round_id AND created_by = auth.uid()
  );
$$;

-- Check if user is a player in a round (bypasses RLS)
CREATE OR REPLACE FUNCTION is_round_player(p_round_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM round_players
    WHERE round_id = p_round_id AND user_id = auth.uid()
  );
$$;

-- ============================================
-- STEP 2: Drop ALL existing policies
-- ============================================

-- Rounds policies
DROP POLICY IF EXISTS "Users can read rounds they created or play in" ON rounds;
DROP POLICY IF EXISTS "Users can read their rounds" ON rounds;
DROP POLICY IF EXISTS "Users can create rounds" ON rounds;
DROP POLICY IF EXISTS "Round creator can update" ON rounds;
DROP POLICY IF EXISTS "Round creator can delete" ON rounds;

-- Round players policies
DROP POLICY IF EXISTS "Users can read round_players in their rounds" ON round_players;
DROP POLICY IF EXISTS "Users can read round_players" ON round_players;
DROP POLICY IF EXISTS "Round creator can manage players" ON round_players;
DROP POLICY IF EXISTS "Round creator can update players" ON round_players;
DROP POLICY IF EXISTS "Round creator can delete players" ON round_players;

-- Round scores policies
DROP POLICY IF EXISTS "Users can read scores in their rounds" ON round_scores;
DROP POLICY IF EXISTS "Users can read scores" ON round_scores;
DROP POLICY IF EXISTS "Players can insert own scores" ON round_scores;
DROP POLICY IF EXISTS "Players can update own scores" ON round_scores;
DROP POLICY IF EXISTS "Scorers can insert scores" ON round_scores;
DROP POLICY IF EXISTS "Scorers can update scores" ON round_scores;

-- ============================================
-- STEP 3: Create new non-recursive policies
-- ============================================

-- ROUNDS policies
CREATE POLICY "rounds_select" ON rounds
  FOR SELECT USING (created_by = auth.uid() OR is_round_player(id));

CREATE POLICY "rounds_insert" ON rounds
  FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "rounds_update" ON rounds
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "rounds_delete" ON rounds
  FOR DELETE USING (created_by = auth.uid());

-- ROUND_PLAYERS policies
CREATE POLICY "round_players_select" ON round_players
  FOR SELECT USING (user_id = auth.uid() OR is_round_creator(round_id));

CREATE POLICY "round_players_insert" ON round_players
  FOR INSERT WITH CHECK (is_round_creator(round_id));

CREATE POLICY "round_players_update" ON round_players
  FOR UPDATE USING (is_round_creator(round_id));

CREATE POLICY "round_players_delete" ON round_players
  FOR DELETE USING (is_round_creator(round_id));

-- ROUND_SCORES policies
CREATE POLICY "round_scores_select" ON round_scores
  FOR SELECT USING (is_round_creator(round_id) OR is_round_player(round_id));

CREATE POLICY "round_scores_insert" ON round_scores
  FOR INSERT WITH CHECK (is_round_creator(round_id) OR is_round_player(round_id));

CREATE POLICY "round_scores_update" ON round_scores
  FOR UPDATE USING (is_round_creator(round_id) OR is_round_player(round_id));
