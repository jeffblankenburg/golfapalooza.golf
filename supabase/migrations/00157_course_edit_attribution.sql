-- Issue #133. Loozer-editable courses need an attribution line on the
-- detail page ("Last edited by Jeff Blankenburg, May 26"). Add updated_at
-- and updated_by to courses. The application stamps these on every write
-- path — no trigger, so the responsibility stays explicit and visible
-- alongside the SQL it relates to.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: existing rows get their created_at as a sensible last-edit
-- baseline so the UI doesn't show "Last edited: never" for every legacy
-- course. updated_by stays NULL until the next write attributes it.
UPDATE courses SET updated_at = created_at WHERE updated_at IS NULL;
