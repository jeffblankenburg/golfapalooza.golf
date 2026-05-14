-- Track whether a player's stored handicap was hand-entered by an admin
-- or auto-computed from completed rounds. Admin-only signal — public side
-- doesn't care. Existing rows default to 'manual' since every current
-- handicap on the system was hand-entered before this column existed.

ALTER TABLE player_handicaps
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'computed'));
