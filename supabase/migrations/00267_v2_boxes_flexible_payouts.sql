-- Flexible Boxes payouts (#230). Move payout allocation from per-STRUCTURE
-- percentages (one split shared by all quarter games) to per-GAME allocations,
-- where every slot is entered as a dollar amount, a percent, or "remainder":
--   game_alloc   { kind: 'amount'|'percent'|'remainder', value }  -- this game's cut of the pot
--   period_alloc { "Q1": {kind,value}, "Half": {...}, ... }       -- that cut, split across periods
-- Lets an admin say "each MNF game pays $80 (Q1 $10, Q2 $20, Q3 $10, Q4 $40),
-- and the Super Bowl takes whatever pot is left." NULL on either column = fall
-- back to the legacy pot_allocation + period_weights percentage behavior, so
-- existing pools keep paying out until they're re-saved in the new editor.
ALTER TABLE public.v2_boxes_games ADD COLUMN IF NOT EXISTS game_alloc JSONB;
ALTER TABLE public.v2_boxes_games ADD COLUMN IF NOT EXISTS period_alloc JSONB;
