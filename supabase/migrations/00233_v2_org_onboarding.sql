-- 00233_v2_org_onboarding.sql
-- New-group onboarding checklist (issue: v2 group onboarding).
-- A dismissible "Get your group ready" card shows on the group home for admins
-- until every setup step is done OR the admin dismisses it. Dismissal is stored
-- per-org (any admin can dismiss for the whole group) as a timestamp.

ALTER TABLE v2_organizations
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at TIMESTAMPTZ;

-- Data API access already granted on v2_organizations in the clean foundation
-- (00179); no new table, so no additional grants are required.
