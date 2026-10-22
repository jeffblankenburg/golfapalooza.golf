-- 00272: Pick'em games can be sourced from the ESPN feed (parity with Boxes).
-- Store the ESPN event id + league so the game picker round-trips selections and
-- a future auto-grading cron can match results/lines. Nullable — legacy/manual
-- games just leave them NULL.

ALTER TABLE public.v2_pickem_games ADD COLUMN IF NOT EXISTS espn_event_id TEXT;
ALTER TABLE public.v2_pickem_games ADD COLUMN IF NOT EXISTS league TEXT;

CREATE INDEX IF NOT EXISTS idx_v2_pickem_games_espn ON public.v2_pickem_games(espn_event_id);
