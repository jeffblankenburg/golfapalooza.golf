-- Issue #125 Phase 3 (continued) — link payout_sheet_events to cost_items.
--
-- Each payout-sheet row (Thursday Skins, 100 Feet, KGB Cup, etc.) is funded
-- by one cost_item. After this migration + a small read-side overlay, the
-- effective per-participant amount comes from cost_items.cost — same pattern
-- we used to make trip_options.cost derive from cost_items.
--
-- Phase 1 here: add the column. Backfill comes in a follow-up script.
-- Existing reads continue using `amount_per_participant` as a fallback so
-- this migration is purely additive and safe to apply alone.

ALTER TABLE public.payout_sheet_events
  ADD COLUMN IF NOT EXISTS cost_item_id UUID
    REFERENCES public.cost_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payout_sheet_events_cost_item
  ON public.payout_sheet_events(cost_item_id)
  WHERE cost_item_id IS NOT NULL;
