-- Add 'quantity' option_type: a list of choices where each is given a numeric
-- count (e.g., "How many of each beer?"). Stored value is a JSON object of
-- { choice_value: integer }. Adds an optional max_total cap that limits the
-- sum of quantities across all choices for a single user.

ALTER TABLE trip_options
  DROP CONSTRAINT IF EXISTS trip_options_option_type_check;

ALTER TABLE trip_options
  ADD CONSTRAINT trip_options_option_type_check
  CHECK (option_type IN ('checkbox', 'select', 'multi_select', 'text', 'number', 'quantity'));

ALTER TABLE trip_options
  ADD COLUMN IF NOT EXISTS max_total INTEGER;

ALTER TABLE trip_options
  ADD CONSTRAINT trip_options_max_total_positive
  CHECK (max_total IS NULL OR max_total > 0);
