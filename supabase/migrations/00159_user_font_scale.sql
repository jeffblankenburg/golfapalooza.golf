-- Issue #138. Per-user text size preference. Older Loozers want a way to
-- bump the type. Stored as a text enum so future tiers ("small", "xxlarge")
-- can be added without another migration. CHECK constraint keeps the API
-- honest. Default 'default' = 100%, 'large' = 115%, 'xlarge' = 130%; the
-- multiplier mapping lives in app code, not the DB.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS font_scale TEXT NOT NULL DEFAULT 'default'
    CHECK (font_scale IN ('default', 'large', 'xlarge'));

-- users is already exposed to authenticated/service_role from prior
-- migrations; no new GRANT needed.
