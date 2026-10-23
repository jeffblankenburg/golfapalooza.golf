-- 00278_v2_pickem_team_abbrev.sql
-- Store each pick'em game's ESPN team abbreviations (e.g. DUKE, UVA, ARMY, TLSA)
-- alongside the full names, so compact matchup/spread labels can use the short
-- form instead of overflowing with "Tulsa Golden Hurricane". Full names stay for
-- the primary pick buttons. Nullable: manually-added games (no ESPN) keep NULL and
-- fall back to the full name at display time.

ALTER TABLE public.v2_pickem_games
  ADD COLUMN IF NOT EXISTS away_abbrev TEXT,
  ADD COLUMN IF NOT EXISTS home_abbrev TEXT;
