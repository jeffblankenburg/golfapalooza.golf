-- Adds best-of-N series support to cornhole bracket matches.
-- When series_best_of is set (e.g., 3), the match is won only when one slot
-- records ceil(series_best_of / 2) game wins. Today, only the Cornhole
-- Singles final uses this (hardcoded to 3 at bracket generation).

ALTER TABLE public.cornhole_bracket_matches
  ADD COLUMN IF NOT EXISTS series_best_of INT,
  ADD COLUMN IF NOT EXISTS slot1_wins INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slot2_wins INT NOT NULL DEFAULT 0;
