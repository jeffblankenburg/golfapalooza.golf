-- 00298_v2_threes_add_logo_three.sql
--
-- #246: "Logo 3" — a 3-pointer from way out (logo range), a distinct play worth
-- $2 (vs a normal 3-pointer's $1). Widen the event_type CHECK to allow it.

ALTER TABLE public.v2_3s_events DROP CONSTRAINT IF EXISTS v2_3s_events_event_type_check;
ALTER TABLE public.v2_3s_events ADD CONSTRAINT v2_3s_events_event_type_check
  CHECK (event_type IN (
    'three_pointer','logo_three','three_point_play','dunk','four_point_play','half_court','buzzer_beater',
    'airball_backcourt','airball_frontcourt','missed_dunk'));
