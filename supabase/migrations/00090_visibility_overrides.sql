-- Add JSONB column for admin visibility overrides.
-- Keys: scoring, tee_times, scorecards, skins, hundred_feet, daily_games, rooms, teams
-- Values: true = force visible, false/missing = use auto time rule
ALTER TABLE public.trip_settings
  ADD COLUMN IF NOT EXISTS visibility_overrides JSONB NOT NULL DEFAULT '{}';
