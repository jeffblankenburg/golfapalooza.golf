-- Issue #125 follow-up — admin-configurable payout splits.
--
-- Previously the "$80 to 2nd place, remainder to 1st" rule for scramble Team
-- was hardcoded in three places (scrambles page, Winners grid aggregator,
-- denomination calculator). This column moves the split configuration to
-- the database so admin can edit it without a code deploy.
--
-- Shape: array of { place, kind, amount? } objects.
--
--   place: 1, 2, 3, ...
--   kind:  'remainder'           — gets whatever's left after the fixed places
--          'flat'                — fixed dollar amount (uses `amount`)
--          'percentage'          — percent of pot (uses `amount`, 0–100)
--          'single_winner'       — full pot to one place
--          'skins_proportional'  — Skins-specific (calcSkins computes split)
--
-- Examples:
--   scramble Team:    [{place:1, kind:"remainder"}, {place:2, kind:"flat", amount:80}]
--   single winner:    [{place:1, kind:"single_winner"}]
--   skins:            [{place:1, kind:"skins_proportional"}]
--   pickem:           null  (split lives in pickem_settings.payout_json)
--   pass-through:     null  (no payout)
--
-- Phase 1 here: add the column. Backfill comes in a follow-up script that
-- populates per-row defaults based on winner_source. Existing consumers
-- still work — payout_splits=null falls back to the kind-default in code.

ALTER TABLE public.payout_sheet_events
  ADD COLUMN IF NOT EXISTS payout_splits JSONB;
