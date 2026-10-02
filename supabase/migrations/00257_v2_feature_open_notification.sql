-- 00257_v2_feature_open_notification.sql
-- Generalize the "it's now open" authored notification to EVERY feature (#218).
-- Features already carry an availability window (availability / available_from /
-- available_until, migration earlier); this adds an admin-authored notification that
-- fires the moment a feature's window opens. Supersedes the options-specific
-- v2_event_option_settings scheduling (now unused).

ALTER TABLE public.v2_event_features
  ADD COLUMN IF NOT EXISTS open_notification_title   TEXT,
  ADD COLUMN IF NOT EXISTS open_notification_body    TEXT,
  ADD COLUMN IF NOT EXISTS open_notification_sent_at TIMESTAMPTZ;
