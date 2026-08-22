-- Payout Denominations — manual control (issue: extreme denominations rework)
-- Two new per-row knobs on the cash sheet:
--   payee_count           — how many payouts this prize makes (seeds the
--                           suggested bill mix; e.g. 8 for two teams of four).
--                           NULL = unset (fall back to a lump suggestion).
--   denomination_override — admin-hand-picked bill breakdown as {denom: count},
--                           e.g. {"100":4,"20":1,"10":1}. NULL = use the
--                           auto suggestion. When set it is the source of truth
--                           and the app validates it sums to the row's pot.
-- Existing RLS/grants on payout_sheet_events already cover these columns.

ALTER TABLE public.payout_sheet_events
  ADD COLUMN IF NOT EXISTS payee_count SMALLINT
    CHECK (payee_count IS NULL OR payee_count > 0),
  ADD COLUMN IF NOT EXISTS denomination_override JSONB;
