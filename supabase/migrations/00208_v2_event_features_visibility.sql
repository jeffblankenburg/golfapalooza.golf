-- Feature toggles are three-state, not on/off. A feature can be:
--   'off'      — hidden from everyone
--   'everyone' — visible to all members
--   'admins'   — visible only to org admins/owners (stage a feature before launch)
-- Replaces the boolean `enabled` on v2_event_features. Applied per scope
-- (org-default rows + event overrides) exactly like every other setting.
--
-- Robust whether or not 00207 has been applied yet: this always runs after the
-- table exists, and backfills/drops the old boolean only if it's still present.

ALTER TABLE public.v2_event_features
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'off'
  CHECK (visibility IN ('off', 'everyone', 'admins'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v2_event_features'
      AND column_name = 'enabled'
  ) THEN
    UPDATE public.v2_event_features
      SET visibility = CASE WHEN enabled THEN 'everyone' ELSE 'off' END;
    ALTER TABLE public.v2_event_features DROP COLUMN enabled;
  END IF;
END $$;
