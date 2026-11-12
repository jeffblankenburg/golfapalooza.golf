-- 00289: Admin-settable "founded" year for an organization.
-- The no-event group home shows "Since <year>" in the stripe where an event's
-- dates would be. That year defaulted to the year the v2 org row was created,
-- which is wrong for groups importing real history (e.g. "Since 1997"). This adds
-- an explicit, admin-editable founded_year; the home falls back to created_at's
-- year when it's NULL. Nullable, no backfill — absence means "use created_at".

ALTER TABLE public.v2_organizations
  ADD COLUMN IF NOT EXISTS founded_year INTEGER
  CHECK (founded_year IS NULL OR (founded_year BETWEEN 1800 AND 2200));

-- No new GRANT needed: v2_organizations already grants column-less table access
-- to authenticated/service_role, which covers added columns.
