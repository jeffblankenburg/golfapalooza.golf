-- Issue #124 Phase F (between trips). Drop the dead-letter columns and
-- legacy winner tables that the contest-spine refactor replaced.
--
-- Source-of-truth mapping for the dropped pieces:
--   payout_sheet_events.winner_source       → contests.contest_type
--   payout_sheet_events.winner_day_number   → contests.day_number
--   payout_sheet_events.payout_splits       → contests.payout_splits
--   payout_sheet_events.cost_item_id        → contests.buy_in_cost_item_id
--   pickem_settings.payout_json             → contests.payout_splits
--                                             (Pickem percentages)
--   daily_contest_winners                   → contest_winners (per-day
--                                             contests, place=1)
--   pickem_payouts.paid_out                 → contest_winners.paid
--   payout_paid_status                      → contest_winners.paid
--
-- Code that wrote/read these landed in the prior commit; this migration
-- finishes the cleanup.

-- 1. Drop redundant columns from payout_sheet_events.
ALTER TABLE public.payout_sheet_events
  DROP COLUMN IF EXISTS winner_source,
  DROP COLUMN IF EXISTS winner_day_number,
  DROP COLUMN IF EXISTS payout_splits,
  DROP COLUMN IF EXISTS cost_item_id;

-- 2. Drop pickem_settings.payout_json (now contests.payout_splits).
ALTER TABLE public.pickem_settings
  DROP COLUMN IF EXISTS payout_json;

-- 3. Drop the legacy winner-storage tables. contest_winners is the
--    single source of truth for who won what and what's paid out.
DROP TABLE IF EXISTS public.daily_contest_winners;
DROP TABLE IF EXISTS public.pickem_payouts;
DROP TABLE IF EXISTS public.payout_paid_status;
