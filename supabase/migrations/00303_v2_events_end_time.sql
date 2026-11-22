-- Events can carry an end TIME, mirroring start_time (migration 00274).
--
-- start_date + start_time already pin the kickoff instant; end_date + end_time
-- now pin the finish. This matters most for short, single-day events (a Super
-- Bowl party that runs 6:00–10:00 PM): the countdown's "Underway → Complete"
-- flip lands at the real end time instead of defaulting to end-of-day. Both
-- halves are nullable and optional; an event with no end_time keeps the prior
-- 23:59:59 end-of-day behavior. Interpreted in the event's timezone, same as
-- start_time (see src/lib/v2/timezone.ts).

ALTER TABLE public.v2_events ADD COLUMN IF NOT EXISTS end_time TIME;
