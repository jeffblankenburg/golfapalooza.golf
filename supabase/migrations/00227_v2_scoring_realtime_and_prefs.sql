-- 00227_v2_scoring_realtime_and_prefs.sql
-- Live scoring for v2 My Rounds:
--   1. Publish the round tables for realtime so two phones in the same group
--      stay in lockstep (scores, roster, status → completed). RLS still applies.
--   2. REPLICA IDENTITY FULL so DELETE events carry the full old row (needed for
--      the round_id filter to match and to drop a cleared hole live).
--   3. Per-golfer configurable "tracked stats" — which optional per-hole fields
--      the scorer captures beyond strokes. Personal & global (on the profile),
--      like the rest of the scoring subsystem. Default: putts.

-- 1 + 2) Realtime.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_round_scores;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_round_players;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_rounds;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.v2_round_scores REPLICA IDENTITY FULL;
ALTER TABLE public.v2_round_players REPLICA IDENTITY FULL;
ALTER TABLE public.v2_rounds REPLICA IDENTITY FULL;

-- 3) Configurable tracked stats. Strokes are always captured; this JSONB array
--    holds the optional extras the golfer wants ("putts", "fairways", "gir",
--    "penalties"). Stored on the profile so it follows the golfer everywhere.
ALTER TABLE public.v2_profiles
  ADD COLUMN IF NOT EXISTS tracked_stats JSONB NOT NULL DEFAULT '["putts"]'::jsonb;
