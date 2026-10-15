-- Boxes live scoring (#230). Two columns the every-minute scores cron fills for
-- locked pools whose games are in progress:
--   start_time  - ESPN kickoff, captured when the game is picked. Lets the cron
--                 gate ESPN calls to a game's actual window (start_time <= now,
--                 not yet final) instead of polling a week-out game every minute.
--                 NULL (legacy rows) is treated as "always eligible".
--   live_score  - the current running score + state, refreshed each tick:
--                 { away, home, state: pre|in|post, detail: "Q2 3:45" }. Drives
--                 the home-page "currently-winning square" highlight WITHOUT a
--                 per-request ESPN call. period_scores (00265) holds the
--                 period-end snapshots that drive the payout sheet.
ALTER TABLE public.v2_boxes_games ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ;
ALTER TABLE public.v2_boxes_games ADD COLUMN IF NOT EXISTS live_score JSONB;
