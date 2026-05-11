-- Issue #125 follow-up — auto-derive the "Trip Cost" option from cost_items
-- flagged `included_in_trip_cost=true`. Replaces the brittle "manually
-- link every new trip-cost item to the Trip Cost option" workflow.
--
-- When this flag is set on an option, `computeOptionCosts` ignores any
-- explicit `linked_option_id` linkages and computes the option's cost as
-- `SUM(cost_items.cost) WHERE cost_items.trip_id = option.trip_id AND
--  cost_items.included_in_trip_cost = true`. Adding a new trip-cost item
-- automatically flows into the option's total.

ALTER TABLE public.trip_options
  ADD COLUMN IF NOT EXISTS auto_include_trip_cost_items BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trip_options.auto_include_trip_cost_items IS
  'When true (typically on the "Trip Cost" option), this option''s cost auto-derives from cost_items.included_in_trip_cost rather than explicit cost_item_option_choices linkages. Set per-trip on the single option that represents the bundled trip cost.';
