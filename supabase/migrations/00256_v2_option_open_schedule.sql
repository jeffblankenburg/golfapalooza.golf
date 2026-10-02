-- 00256_v2_option_open_schedule.sql
-- Options get a scheduled OPEN time (not just a close deadline), so admins can set it
-- and trust it opens automatically — plus an authored notification that fires at that
-- moment (#218). First of many things that will want a start+end window; the pattern
-- lives here for now.

ALTER TABLE public.v2_event_option_settings
  ADD COLUMN IF NOT EXISTS selection_open_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_notification_title  TEXT,
  ADD COLUMN IF NOT EXISTS open_notification_body   TEXT,
  ADD COLUMN IF NOT EXISTS open_notification_sent_at TIMESTAMPTZ;

-- Existing event, grants already set in 00255; nothing else needed.
