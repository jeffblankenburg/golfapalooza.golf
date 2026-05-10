-- Issue #124 Phase C+D+E (streamlined) — make `contest_winners` a single
-- store for every kind of contest winner. Today it's Calcutta-only via
-- `prize_id`; we extend it with `contest_id`-based generic rows so daily
-- contests, scramble teams, skins, hundred feet, and pickem can all
-- write here too.
--
-- Calcutta keeps using `prize_id` (its prize-resolution flow is tightly
-- coupled to calcutta_prizes) — those rows have `contest_id` NULL.
-- Generic rows have `prize_id` NULL and `contest_id` set.
-- A CHECK ensures exactly one is set.
--
-- Old per-type winner tables (`daily_contest_winners`, `pickem_payouts`,
-- `payout_paid_status`) stay in place as a safety net for the upcoming
-- trip; Phase F drops them after one trip cycle of clean operation.

-- 1. Make prize_id nullable so generic rows don't need it.
ALTER TABLE public.contest_winners
  ALTER COLUMN prize_id DROP NOT NULL;

-- 2. Generic-row columns.
ALTER TABLE public.contest_winners
  ADD COLUMN IF NOT EXISTS contest_id UUID
    REFERENCES public.contests(id) ON DELETE CASCADE;

-- partner_user_id — for team-shape wins (doubles cornhole). Singles
-- cornhole and individual events leave this null. Scramble teams use
-- one row per member instead, so they don't need partner_user_id.
ALTER TABLE public.contest_winners
  ADD COLUMN IF NOT EXISTS partner_user_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.contest_winners
  ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.contest_winners
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.contest_winners
  ADD COLUMN IF NOT EXISTS paid_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

-- Per-row dollar amount the winner is entitled to. Denormalized on
-- purpose: the materializer computes it from contest pot × payout_splits
-- (and per-team skin distribution for skins) and writes it here. Readers
-- (Winners grid, denomination sheet, lifetime payout queries) read this
-- directly with no per-contest-type math. Stays fresh because the grid
-- lazy-materializes on load.
ALTER TABLE public.contest_winners
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2);

-- 'rule' (computed from contest data via materializer)
-- 'manual' (admin entered via UI)
-- 'derived' (legacy — backfilled from old per-type tables)
ALTER TABLE public.contest_winners
  ADD COLUMN IF NOT EXISTS determined_by VARCHAR(20) DEFAULT 'rule';

-- 3. Exactly one of (prize_id, contest_id) must be set on every row.
ALTER TABLE public.contest_winners
  DROP CONSTRAINT IF EXISTS contest_winners_source_check;
ALTER TABLE public.contest_winners
  ADD CONSTRAINT contest_winners_source_check
  CHECK ((prize_id IS NOT NULL)::int + (contest_id IS NOT NULL)::int = 1);

-- 4. The existing UNIQUE(prize_id, user_id) was created inline as a
--    table constraint (auto-named …_prize_id_user_id_key). Rebuild as
--    a partial index so it only applies to Calcutta rows.
ALTER TABLE public.contest_winners
  DROP CONSTRAINT IF EXISTS contest_winners_prize_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS contest_winners_calcutta_key
  ON public.contest_winners(prize_id, user_id)
  WHERE prize_id IS NOT NULL;

-- 5. Generic rows: a user can occupy place P in contest C only once.
--    Multiple users can share the same place — e.g. each member of a
--    scramble team gets a row at place=1 for the team's win.
CREATE UNIQUE INDEX IF NOT EXISTS contest_winners_generic_key
  ON public.contest_winners(contest_id, place, user_id)
  WHERE contest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contest_winners_contest_id
  ON public.contest_winners(contest_id)
  WHERE contest_id IS NOT NULL;
