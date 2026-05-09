-- Issue #124 Phase A — contests-as-spine schema foundation.
--
-- Goal: make `contests` the single source of truth for "what gets played
-- and who wins", while `cost_items` remains the source of truth for "what
-- it costs". Today, `payout_sheet_events` carries duplicated columns
-- (`participant_source`, `winner_source`, `winner_day_number`) that
-- overlap with contest semantics. This migration is purely additive —
-- it gives us the fields to migrate onto, without breaking anything that
-- still reads the old columns.
--
-- This phase adds:
--   1. contests.buy_in_cost_item_id   → "what does it cost to enter?"
--   2. contests.parent_contest_id     → "this contest lives inside that
--                                       contest" (e.g. Skins inside a
--                                       Scramble day)
--   3. contests.payout_splits         → "how does the pot get carved up?"
--                                       (same JSONB shape used by
--                                       payout_sheet_events.payout_splits)
--   4. payout_sheet_events.contest_id → bridge to migrate rows over to
--                                       contest-driven payouts
--
-- Phase B (next) will generate the missing daily contest rows
-- (per-day Skins, CTP front/back, Long Drive, Long Putt) and link
-- payout_sheet_events.contest_id to them.

-- 1. Cost wiring
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS buy_in_cost_item_id UUID
    REFERENCES public.cost_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contests_buy_in_cost_item
  ON public.contests(buy_in_cost_item_id)
  WHERE buy_in_cost_item_id IS NOT NULL;

-- 2. Contest hierarchy (Skins lives inside a Scramble day, etc.)
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS parent_contest_id UUID
    REFERENCES public.contests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contests_parent
  ON public.contests(parent_contest_id)
  WHERE parent_contest_id IS NOT NULL;

-- Belt-and-suspenders cycle guard — a contest cannot be its own parent.
-- Deeper cycles are prevented by the application; this catches the
-- one-step case at the DB.
ALTER TABLE public.contests
  ADD CONSTRAINT contests_parent_not_self
  CHECK (parent_contest_id IS NULL OR parent_contest_id <> id);

-- 3. Pot-split rules live on the contest itself. Same JSONB shape as
--    payout_sheet_events.payout_splits — see src/lib/payout-events/splits.ts
--    for `PayoutSplit` type. NULL means "not yet configured" and falls
--    back to defaults at compute time.
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS payout_splits JSONB;

-- 4. Bridge column. Existing payout_sheet_events rows still read from
--    `winner_source` / `participant_source` until Phase D switches
--    reads over.
ALTER TABLE public.payout_sheet_events
  ADD COLUMN IF NOT EXISTS contest_id UUID
    REFERENCES public.contests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payout_sheet_events_contest
  ON public.payout_sheet_events(contest_id)
  WHERE contest_id IS NOT NULL;
