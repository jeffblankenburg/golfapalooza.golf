-- Add sim_date column to trip_settings for global time simulation
-- Stores simulated date as text (e.g. "2026-09-03" or "2026-09-03T14:30")
ALTER TABLE trip_settings ADD COLUMN IF NOT EXISTS sim_date TEXT DEFAULT NULL;
