-- Group-scoped contests (#231, minimal slice for Boxes) + Boxes/Squares schema
-- (#230). Lets a contest belong to the org directly (event_id NULL) so sports
-- pools live BESIDE the single active event, available to all members. Adds the
-- Boxes grid: ownership bought once (cells), everything else per game.

-- 1) Group-scoped lane: event_id becomes optional on v2_contests. org_id stays
--    NOT NULL (the tenant scope). Existing event contests are untouched; a NULL
--    event_id means "group-level, all members". v2_contest_participants and
--    v2_contest_winners reference the CONTEST (no event_id of their own), so they
--    are already group-compatible — no change needed.
ALTER TABLE public.v2_contests ALTER COLUMN event_id DROP NOT NULL;

-- 2) New contest type (extend the existing inline CHECK).
ALTER TABLE public.v2_contests DROP CONSTRAINT IF EXISTS v2_contests_contest_type_check;
ALTER TABLE public.v2_contests ADD CONSTRAINT v2_contests_contest_type_check
  CHECK (contest_type IN (
    'scramble','skins','ctp','long_drive','long_putt',
    'bspitw','hundred_feet','ryder_cup','calcutta',
    'cornhole','pickem','boxes','other'));

-- 3) Boxes games: one row per game in the series. Teams sit on the axes, digits
--    are (re)drawn + frozen per game, and each game carries its pot share + period
--    weights. Period STRUCTURE (halves vs quarters) is derived from `league`.
DROP TABLE IF EXISTS public.v2_boxes_games CASCADE;
CREATE TABLE public.v2_boxes_games (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id     UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  espn_event_id  TEXT,
  league         TEXT NOT NULL,                     -- league key (periods derive from it)
  label          TEXT,                              -- "Super Bowl", "Week 5", "R1 - East 1v16"
  sort_order     INT NOT NULL DEFAULT 0,
  team_row       JSONB,                             -- { name, abbrev, espn_id, logo, color }
  team_col       JSONB,
  row_digits     SMALLINT[] NOT NULL DEFAULT '{}',  -- permutation of 0-9, drawn + frozen at lock
  col_digits     SMALLINT[] NOT NULL DEFAULT '{}',
  period_weights JSONB,                             -- { Q1:15, ... }; NULL = league default
  game_weight    NUMERIC NOT NULL DEFAULT 1,        -- share of the pot (pot allocation)
  status         TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | in_progress | final
  locked_at      TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contest_id, espn_event_id)
);
CREATE INDEX idx_v2_boxes_games_contest ON public.v2_boxes_games(contest_id, sort_order);

-- 4) Boxes cells: ownership of the 100 squares, bought ONCE, persisting across
--    every game in the series. (grid_row, grid_col) are grid positions; the digit
--    each maps to is per-game (v2_boxes_games.row_digits / col_digits).
DROP TABLE IF EXISTS public.v2_boxes_cells CASCADE;
CREATE TABLE public.v2_boxes_cells (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id   UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  grid_row     SMALLINT NOT NULL CHECK (grid_row BETWEEN 0 AND 9),
  grid_col     SMALLINT NOT NULL CHECK (grid_col BETWEEN 0 AND 9),
  user_id      UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,  -- NULL = open
  purchased_at TIMESTAMPTZ,
  UNIQUE(contest_id, grid_row, grid_col)
);
CREATE INDEX idx_v2_boxes_cells_contest ON public.v2_boxes_cells(contest_id);

-- 5) RLS (permissive DB layer; the API gates writes), grants, realtime.
ALTER TABLE public.v2_boxes_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_boxes_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_boxes_games_all" ON public.v2_boxes_games FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_boxes_cells_all" ON public.v2_boxes_cells FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_boxes_games TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_boxes_cells TO authenticated, service_role;

ALTER TABLE public.v2_boxes_games REPLICA IDENTITY FULL;
ALTER TABLE public.v2_boxes_cells REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'v2_boxes_games') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_boxes_games;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'v2_boxes_cells') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_boxes_cells;
  END IF;
END $$;
