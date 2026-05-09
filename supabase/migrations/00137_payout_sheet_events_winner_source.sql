-- Issue #103 follow-up — explicit winner_source column.
-- Replaces fragile label-substring matching (`classify()` in grid.ts) with a
-- discriminator the admin sets explicitly. winner_day_number is required for
-- per-day contests (CTP, LD, LP) so the lookup doesn't need to parse the label.
--
-- Allowed winner_source values:
--   scramble_team   — winner = scramble_teams ordered by gross_score (top 2)
--                     uses source_ref (scramble contest_id) to find teams
--   scramble_skins  — winner = calcSkins live computation
--                     uses source_ref (scramble contest_id)
--   ctp_front       — winner = daily_contest_winners(day, 'ctp_front')
--                     requires winner_day_number
--   ctp_back        — winner = daily_contest_winners(day, 'ctp_back')
--                     requires winner_day_number
--   long_drive      — winner = daily_contest_winners(day, 'long_drive')
--                     requires winner_day_number
--   long_putt       — winner = daily_contest_winners(day, 'long_putt')
--                     requires winner_day_number
--   hundred_feet    — winner = lowest cumulative hundred_feet_scores total
--   pickem          — winner = derived rankings × pickem_settings.payout_json
--                     uses source_ref (pickem contest_id)
--   none            — pass-through cash, no winners (KGB Cup, Lodge nights)

ALTER TABLE public.payout_sheet_events
  ADD COLUMN IF NOT EXISTS winner_source VARCHAR(30),
  ADD COLUMN IF NOT EXISTS winner_day_number SMALLINT;

ALTER TABLE public.payout_sheet_events
  DROP CONSTRAINT IF EXISTS payout_sheet_events_winner_source_check;

ALTER TABLE public.payout_sheet_events
  ADD CONSTRAINT payout_sheet_events_winner_source_check
  CHECK (winner_source IS NULL OR winner_source IN (
    'scramble_team', 'scramble_skins',
    'ctp_front', 'ctp_back',
    'long_drive', 'long_putt',
    'hundred_feet', 'pickem',
    'none'
  ));

-- Backfill from current labels (mirrors the substring matcher we are about
-- to retire). After this runs, the substring matcher is no longer consulted.
DO $$
BEGIN
  -- scramble_team / scramble_skins
  UPDATE public.payout_sheet_events
    SET winner_source = 'scramble_team'
    WHERE participant_source = 'scramble' AND lower(label) LIKE '%team%' AND winner_source IS NULL;
  UPDATE public.payout_sheet_events
    SET winner_source = 'scramble_skins'
    WHERE participant_source = 'scramble' AND lower(label) LIKE '%skins%' AND winner_source IS NULL;

  -- pickem
  UPDATE public.payout_sheet_events
    SET winner_source = 'pickem'
    WHERE participant_source = 'pickem_payments' AND winner_source IS NULL;

  -- 100 feet
  UPDATE public.payout_sheet_events
    SET winner_source = 'hundred_feet'
    WHERE (lower(label) LIKE '%100%' OR lower(label) LIKE '%hundred%') AND winner_source IS NULL;

  -- CTP back / front (back must come first so the front matcher doesn't claim "back" rows)
  UPDATE public.payout_sheet_events
    SET winner_source = 'ctp_back'
    WHERE (lower(label) LIKE '%ctp%' OR lower(label) LIKE '%par 3%' OR lower(label) LIKE '%closest%')
      AND lower(label) LIKE '%back%' AND winner_source IS NULL;
  UPDATE public.payout_sheet_events
    SET winner_source = 'ctp_front'
    WHERE (lower(label) LIKE '%ctp%' OR lower(label) LIKE '%par 3%' OR lower(label) LIKE '%closest%')
      AND winner_source IS NULL;

  -- Long drive / putt
  UPDATE public.payout_sheet_events
    SET winner_source = 'long_drive'
    WHERE lower(label) LIKE '%long drive%' AND winner_source IS NULL;
  UPDATE public.payout_sheet_events
    SET winner_source = 'long_putt'
    WHERE lower(label) LIKE '%long putt%' AND winner_source IS NULL;

  -- Day backfill: parse from the label for daily-contest rows
  UPDATE public.payout_sheet_events
    SET winner_day_number = 2
    WHERE winner_source IN ('ctp_front', 'ctp_back', 'long_drive', 'long_putt')
      AND lower(label) LIKE '%thursday%' AND winner_day_number IS NULL;
  UPDATE public.payout_sheet_events
    SET winner_day_number = 3
    WHERE winner_source IN ('ctp_front', 'ctp_back', 'long_drive', 'long_putt')
      AND lower(label) LIKE '%friday%' AND winner_day_number IS NULL;
  UPDATE public.payout_sheet_events
    SET winner_day_number = 4
    WHERE winner_source IN ('ctp_front', 'ctp_back', 'long_drive', 'long_putt')
      AND lower(label) LIKE '%saturday%' AND winner_day_number IS NULL;

  -- Anything still null (KGB Cup, Lodge nights) is pass-through
  UPDATE public.payout_sheet_events
    SET winner_source = 'none'
    WHERE winner_source IS NULL;
END $$;
