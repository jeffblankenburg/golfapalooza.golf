-- Drop the 4-player cap on round_players.player_position so admins can
-- enter historical or event-day cards that include more than 4 golfers.
-- Live Scoring is still gated to <=4 in the UI (it doesn't fit on-screen
-- past that); Quick Entry and Full Scorecard handle arbitrary N.

ALTER TABLE round_players
  DROP CONSTRAINT IF EXISTS round_players_player_position_check;
