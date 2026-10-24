-- 00280_v2_slate_substrate.sql
--
-- Phase 1 of the sports-prediction epic (#224): the reusable CONTEST-SCOPED
-- matchup + pick substrate that every pick-and-grade contest sits on (straight
-- picks, confidence, parlays, props, round-by-round bracket). Generalizes the
-- pick'em-specific v2_pickem_games / v2_pickem_picks so new types reuse storage,
-- locking, grading, ESPN auto-match, and realtime — only the ranker differs.
--
-- This migration creates the tables only. The pick'em backfill + code repoint
-- land together in a following migration/commit so data and reads switch as one.
-- Distinct from the SHARED tournament substrate (#226, v2_tournament_*): matchups
-- are one set of games per contest; tournaments are one bracket shared by many.

DROP TABLE IF EXISTS public.v2_picks CASCADE;
DROP TABLE IF EXISTS public.v2_matchups CASCADE;

-- One game/matchup in a contest's slate. Competitors are JSON refs (no teams FK)
-- so the substrate is sport-agnostic; ESPN ids + league ride along for grading.
CREATE TABLE public.v2_matchups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  slot          TEXT NOT NULL,                              -- contest-defined key ("game-3","r1-east-1v16")
  round         TEXT,                                       -- optional group label ("R1","Thu-early")
  sort_order    INTEGER NOT NULL DEFAULT 0,
  competitor_a  JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { name, espn_id?, seed?, region?, logo?, color? }
  competitor_b  JSONB NOT NULL DEFAULT '{}'::jsonb,
  start_time    TIMESTAMPTZ,                                -- drives lock (earliest across the slate)
  spread        NUMERIC,                                    -- nullable (ATS); points the favorite is favored by
  favorite      TEXT CHECK (favorite IN ('a', 'b')),        -- which competitor the spread applies to
  over_under    NUMERIC,                                    -- nullable (O/U)
  external_ref  JSONB NOT NULL DEFAULT '{}'::jsonb,         -- { espn_event_id?, league? } for #225 grading
  status        TEXT NOT NULL DEFAULT 'scheduled'           -- scheduled | in_progress | final
                  CHECK (status IN ('scheduled', 'in_progress', 'final')),
  result        JSONB,                                      -- { winner:'a'|'b'|null, score_a, score_b } once final
  is_tiebreaker BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contest_id, slot)
);
CREATE INDEX idx_v2_matchups_contest ON public.v2_matchups(contest_id);

-- One user's pick on one matchup. The `pick` JSONB serves every type:
--   straight/bracket { side:'a'|'b' } · ATS { ats:'a'|'b' } · O/U { ou:'over'|'under' }
--   confidence { side:'a'|'b', weight:N }
CREATE TABLE public.v2_picks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matchup_id  UUID NOT NULL REFERENCES public.v2_matchups(id) ON DELETE CASCADE,
  contest_id  UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE, -- denormalized for per-contest reads
  user_id     UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  pick        JSONB,
  tiebreaker  NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (matchup_id, user_id)
);
CREATE INDEX idx_v2_picks_matchup ON public.v2_picks(matchup_id);
CREATE INDEX idx_v2_picks_contest ON public.v2_picks(contest_id);
CREATE INDEX idx_v2_picks_user ON public.v2_picks(user_id);

-- Permissive RLS, API-gated writes (mirrors the rest of v2, incl. the pickem tables).
ALTER TABLE public.v2_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_matchups_all" ON public.v2_matchups FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_picks_all" ON public.v2_picks FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_matchups TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_picks TO authenticated, service_role;

-- Realtime: live standings subscribe to score/pick changes. FULL replica identity so
-- DELETE events (a cleared pick) carry the old row.
ALTER TABLE public.v2_matchups REPLICA IDENTITY FULL;
ALTER TABLE public.v2_picks REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_matchups;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_picks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
