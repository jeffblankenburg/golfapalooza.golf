-- Issue #125 Phase 5 — destructive cleanup of legacy cost columns now that
-- every consumer reads through cost_items (computeOptionCosts +
-- getPickemEntryFee + loadPayoutSheet).
--
-- Dropped here:
--   trip_options.cost                 → derived via computeOptionCosts
--                                       (auto from cost_items.included_in_trip_cost
--                                        for trip_cost option_type, or summed
--                                        from linked_option_id items)
--   trip_options.choices[].cost       → derived per-choice from
--                                       cost_item_option_choices
--   pickem_settings.entry_fee         → derived from
--                                       contests.buy_in_cost_item_id →
--                                       cost_items.cost (Workstream A)
--
-- Kept on purpose:
--   payout_sheet_events.amount_per_participant — Lodge Mon / Lodge Tue
--     rows have no single cost_item (they aggregate Hotel Mon + Hotel
--     Tue + Wed Breakfast per stayer). The column remains a legitimate
--     fallback for unlinkable rows; the runtime path only reads it
--     when contests.buy_in_cost_item_id is NULL.
--
-- Coverage audit (scripts/audit-option-cost-coverage.mjs) confirmed every
-- paid option on the active + test trips is linked. The dropped values
-- were already inert before this migration — readers overlay cost_items
-- on top of them.

-- 1. Strip `cost` from every trip_options.choices JSONB array. Idempotent:
--    a second run on already-stripped choices is a no-op.
UPDATE public.trip_options
SET choices = (
  SELECT jsonb_agg(choice - 'cost' ORDER BY ord)
  FROM jsonb_array_elements(choices) WITH ORDINALITY AS t(choice, ord)
)
WHERE choices IS NOT NULL
  AND jsonb_typeof(choices) = 'array'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(choices) AS c
    WHERE c ? 'cost'
  );

-- 2. Drop the trip_options.cost column.
ALTER TABLE public.trip_options
  DROP COLUMN IF EXISTS cost;

-- 3. Drop the pickem_settings.entry_fee column.
ALTER TABLE public.pickem_settings
  DROP COLUMN IF EXISTS entry_fee;
