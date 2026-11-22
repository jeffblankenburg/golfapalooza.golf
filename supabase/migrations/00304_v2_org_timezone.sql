-- 00304_v2_org_timezone.sql
-- Org "home" timezone: the IANA zone that group-scoped screens (group contests, the
-- directory, org-level stamps) display times in, and the fallback when an event has
-- not set its own. Events still override per-event via v2_events.timezone.
-- Defaulting to America/New_York matches the events-table default (migration 00275).
-- No new grants needed: adding a column inherits the table's existing grants.

ALTER TABLE public.v2_organizations
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York';
