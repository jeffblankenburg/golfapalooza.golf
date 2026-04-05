-- Add depends_on_option_id to trip_options for conditional/dependent options
ALTER TABLE trip_options
  ADD COLUMN IF NOT EXISTS depends_on_option_id uuid REFERENCES trip_options(id) ON DELETE SET NULL;

-- Index for lookups when cascading deselections
CREATE INDEX IF NOT EXISTS idx_trip_options_depends_on ON trip_options(depends_on_option_id) WHERE depends_on_option_id IS NOT NULL;
