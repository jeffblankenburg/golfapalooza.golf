-- Add on_roster boolean to event_participants
-- Separates RSVP status (likelihood) from roster membership (on_roster)
-- Existing participants are all considered on-roster to preserve current behavior

ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS on_roster BOOLEAN NOT NULL DEFAULT false;

-- Set all existing participants as on-roster
UPDATE event_participants SET on_roster = true;
