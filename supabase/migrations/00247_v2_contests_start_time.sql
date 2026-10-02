-- Contest start time (#209, Phase 2a). A contest is scheduled with a date + time;
-- the start time drives its timed calendar entry and seeds the FIRST tee time when
-- teams/tee-times are built. Naive-local TIME, like the rest of the schedule.

ALTER TABLE public.v2_contests ADD COLUMN IF NOT EXISTS start_time TIME;
