-- Issue #125 follow-up — promote "Trip Cost" from a boolean flag on regular
-- options to its own `option_type`. Cleaner dispatch: each option_type
-- already has its own editor + compute rules, and this slots in alongside
-- 'checkbox' / 'select' / 'multi_select' / 'quantity' instead of being a
-- hidden modifier on top of 'checkbox'.
--
-- Order matters: expand the CHECK constraint BEFORE the UPDATE, otherwise
-- the UPDATE fails against the old constraint that doesn't allow
-- 'trip_cost'.

-- 1. Expand the CHECK constraint first so 'trip_cost' is a legal value.
ALTER TABLE public.trip_options
  DROP CONSTRAINT IF EXISTS trip_options_option_type_check;

ALTER TABLE public.trip_options
  ADD CONSTRAINT trip_options_option_type_check
  CHECK (option_type IN ('checkbox', 'select', 'multi_select', 'text', 'number', 'quantity', 'trip_cost'));

-- 2. Promote any rows that were using the legacy flag.
UPDATE public.trip_options
SET option_type = 'trip_cost'
WHERE auto_include_trip_cost_items = true;

-- 3. Drop the now-redundant flag column.
ALTER TABLE public.trip_options
  DROP COLUMN IF EXISTS auto_include_trip_cost_items;
