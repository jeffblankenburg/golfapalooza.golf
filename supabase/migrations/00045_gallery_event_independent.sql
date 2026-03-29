-- Make gallery event-independent: trip_id becomes optional, add taken_at + sort_date

-- 1. Make trip_id nullable
ALTER TABLE gallery_items ALTER COLUMN trip_id DROP NOT NULL;

-- 2. Change FK from ON DELETE CASCADE to ON DELETE SET NULL
-- Use dynamic lookup since constraint name may be auto-generated
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT constraint_name INTO fk_name
  FROM information_schema.table_constraints
  WHERE table_name = 'gallery_items'
    AND constraint_type = 'FOREIGN KEY'
    AND constraint_name LIKE '%trip%'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE gallery_items DROP CONSTRAINT %I', fk_name);
    ALTER TABLE gallery_items
      ADD CONSTRAINT gallery_items_trip_id_fkey
      FOREIGN KEY (trip_id) REFERENCES trip_settings(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Add taken_at column (EXIF date extracted client-side)
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS taken_at timestamptz;

-- 4. Add sort_date generated column: taken_at first, fall back to created_at
ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS sort_date timestamptz
  GENERATED ALWAYS AS (COALESCE(taken_at, created_at)) STORED;

-- 5. Index for default sort order
CREATE INDEX IF NOT EXISTS idx_gallery_items_sort_date ON gallery_items (sort_date DESC);
