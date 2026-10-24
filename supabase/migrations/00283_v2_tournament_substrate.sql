-- 00283_v2_tournament_substrate.sql
--
-- #226 Part A: the SHARED tournament substrate. A bracketed event (March Madness,
-- NFL/NHL playoffs) is modeled ONCE here and referenced by many contests at once
-- (bracket pool, auction #227, brocket, survivor) via config.tournament_id — so one
-- seeded field, one bracket tree, and one set of results feed every consumer. This is
-- distinct from the contest-scoped v2_matchups (#224); the two meet only at the
-- gradeable shape (external_ref/status/result), bridged by the #225 grader.
--
-- Tables only; the bracket-pool contest + picks land in a later migration (Part B).

DROP TABLE IF EXISTS public.v2_tournament_games CASCADE;
DROP TABLE IF EXISTS public.v2_tournament_teams CASCADE;
DROP TABLE IF EXISTS public.v2_tournaments CASCADE;

-- One bracketed event, org-scoped, shared by many contests.
CREATE TABLE public.v2_tournaments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  sport        TEXT NOT NULL,                                   -- ESPN league key (config.sport), e.g. 'mens-college-basketball'
  season       TEXT,                                            -- e.g. '2027'
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'setup'
                 CHECK (status IN ('setup', 'locked', 'live', 'final')),
  source       TEXT NOT NULL DEFAULT 'manual'
                 CHECK (source IN ('manual', 'espn')),
  external_ref JSONB NOT NULL DEFAULT '{}'::jsonb,              -- { espn_tournament_id? }
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,              -- { regions:[...], rounds:N, ... }
  created_by   UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_tournaments_org ON public.v2_tournaments(org_id);

-- The seeded field (= TournamentSource.getField()).
CREATE TABLE public.v2_tournament_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.v2_tournaments(id) ON DELETE CASCADE,
  espn_id       TEXT,                                           -- ESPN team id, for grading auto-match
  name          TEXT NOT NULL,
  short_name    TEXT,
  seed          INT NOT NULL,
  region        TEXT,                                           -- region / conference label
  logo_url      TEXT,
  color         TEXT,
  eliminated    BOOLEAN NOT NULL DEFAULT false,
  play_in_slot  TEXT,                                           -- if set, this team plays into an R1 slot
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_tournament_teams_tournament ON public.v2_tournament_teams(tournament_id);

-- The bracket tree (= TournamentSource.getBracket()). Ported from bromadness `games`:
-- next_game_id + advances_to_slot wire each winner into the next round's slot.
CREATE TABLE public.v2_tournament_games (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id    UUID NOT NULL REFERENCES public.v2_tournaments(id) ON DELETE CASCADE,
  slot             TEXT NOT NULL,                               -- deterministic key, e.g. 'r1:East:3'
  round            INT NOT NULL,                                -- 0 play-in … N final
  region           TEXT,                                        -- NULL for Final Four / Championship
  game_number      INT NOT NULL,
  team_a_id        UUID REFERENCES public.v2_tournament_teams(id) ON DELETE SET NULL,
  team_b_id        UUID REFERENCES public.v2_tournament_teams(id) ON DELETE SET NULL,
  next_game_id     UUID REFERENCES public.v2_tournament_games(id) ON DELETE SET NULL,
  advances_to_slot TEXT CHECK (advances_to_slot IN ('a', 'b')), -- which slot of next_game the winner fills
  start_time       TIMESTAMPTZ,
  external_ref     JSONB NOT NULL DEFAULT '{}'::jsonb,          -- { espn_event_id? } for #225 grading
  status           TEXT NOT NULL DEFAULT 'scheduled'
                     CHECK (status IN ('scheduled', 'in_progress', 'final')),
  result           JSONB,                                       -- { winner_team_id, score_a, score_b } once final
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tournament_id, slot)
);
CREATE INDEX idx_v2_tournament_games_tournament ON public.v2_tournament_games(tournament_id);

-- Permissive RLS, API-gated writes (mirrors the rest of v2).
ALTER TABLE public.v2_tournaments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_tournament_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_tournaments_all"      ON public.v2_tournaments      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_tournament_teams_all" ON public.v2_tournament_teams FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_tournament_games_all" ON public.v2_tournament_games FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_tournaments      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_tournament_teams TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_tournament_games TO authenticated, service_role;

-- Realtime: live bracket views subscribe to result/advancement changes.
ALTER TABLE public.v2_tournament_games REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_tournament_games;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
