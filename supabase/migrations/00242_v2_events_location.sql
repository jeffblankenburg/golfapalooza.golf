-- Optional, admin-entered event location (issue #190). Free text shown on the
-- home page under the date bar; renders nothing when null/empty. No new grant
-- needed — grants sit on the table, and v2_events is already exposed.

ALTER TABLE public.v2_events ADD COLUMN IF NOT EXISTS location TEXT;
