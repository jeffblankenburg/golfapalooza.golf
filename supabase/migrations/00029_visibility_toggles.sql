-- Add visibility toggle columns to trip_settings
-- These allow admins to control when tee times, teams, and rooms are visible to users.
-- Default to false so content is hidden until the admin explicitly reveals it.

ALTER TABLE public.trip_settings
  ADD COLUMN IF NOT EXISTS show_tee_times BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_teams BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_rooms BOOLEAN NOT NULL DEFAULT false;
