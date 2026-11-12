-- 00296_v2_threes_add_three_pointer.sql
--
-- #246: split "3-pointer" (a made three) from "3-point play" (a basket + the
-- and-1). Same unit value (1X), but they're distinct plays that deserve their
-- own scorer button + their own board reaction. Widen the event_type CHECK.

ALTER TABLE public.v2_3s_events DROP CONSTRAINT IF EXISTS v2_3s_events_event_type_check;
ALTER TABLE public.v2_3s_events ADD CONSTRAINT v2_3s_events_event_type_check
  CHECK (event_type IN (
    'three_pointer','three_point_play','dunk','four_point_play','half_court','buzzer_beater',
    'airball_backcourt','airball_frontcourt','missed_dunk'));
