-- 00299_v2_threes_event_gif.sql
--
-- #246: store the GIF chosen for each logged play on the event row. The pick is
-- made ONCE server-side using a no-repeat "shuffle bag" per reaction type (bag
-- state lives in v2_contests.config.gif_bags), so every big board shows the SAME
-- GIF and no GIF repeats until the rest of that reaction's GIFs have been used.

ALTER TABLE public.v2_3s_events ADD COLUMN IF NOT EXISTS gif_url TEXT;
