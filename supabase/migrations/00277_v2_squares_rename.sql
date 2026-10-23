-- 00277_v2_squares_rename.sql
-- Rename the v2 "Boxes" contest to "Squares" everywhere in the database, matching
-- the user-facing name. Renames the three tables, their indexes and RLS policies,
-- and migrates the contest_type value 'boxes' -> 'squares' (CHECK + live rows).
--
-- Table renames carry their data, FKs, grants, RLS policies, and realtime
-- publication membership automatically (Postgres tracks by OID). We rename the
-- index/policy identifiers too so the DB reads "squares" consistently.
-- Idempotent + rollback-safe: IF EXISTS guards + conditional policy renames.

-- 1) Tables.
ALTER TABLE IF EXISTS public.v2_boxes_games   RENAME TO v2_squares_games;
ALTER TABLE IF EXISTS public.v2_boxes_cells   RENAME TO v2_squares_cells;
ALTER TABLE IF EXISTS public.v2_boxes_payouts RENAME TO v2_squares_payouts;

-- 2) Indexes.
ALTER INDEX IF EXISTS public.idx_v2_boxes_games_contest     RENAME TO idx_v2_squares_games_contest;
ALTER INDEX IF EXISTS public.idx_v2_boxes_cells_contest     RENAME TO idx_v2_squares_cells_contest;
ALTER INDEX IF EXISTS public.v2_boxes_payouts_contest_idx   RENAME TO v2_squares_payouts_contest_idx;

-- 3) RLS policies (ALTER POLICY has no IF EXISTS — guard each one).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'v2_squares_games' AND policyname = 'v2_boxes_games_all') THEN
    ALTER POLICY "v2_boxes_games_all" ON public.v2_squares_games RENAME TO "v2_squares_games_all";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'v2_squares_cells' AND policyname = 'v2_boxes_cells_all') THEN
    ALTER POLICY "v2_boxes_cells_all" ON public.v2_squares_cells RENAME TO "v2_squares_cells_all";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'v2_squares_payouts' AND policyname = 'v2_boxes_payouts_all') THEN
    ALTER POLICY "v2_boxes_payouts_all" ON public.v2_squares_payouts RENAME TO "v2_squares_payouts_all";
  END IF;
END $$;

-- 4) contest_type value: open the CHECK, migrate rows, close it with 'squares'.
ALTER TABLE public.v2_contests DROP CONSTRAINT IF EXISTS v2_contests_contest_type_check;
UPDATE public.v2_contests SET contest_type = 'squares' WHERE contest_type = 'boxes';
ALTER TABLE public.v2_contests ADD CONSTRAINT v2_contests_contest_type_check
  CHECK (contest_type IN (
    'scramble','skins','ctp','long_drive','long_putt',
    'bspitw','hundred_feet','ryder_cup','calcutta',
    'cornhole','pickem','squares','other'));

-- 5) Grants persist through rename, but re-assert them on the new names for clarity.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_squares_games   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_squares_cells   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_squares_payouts TO authenticated, service_role;
