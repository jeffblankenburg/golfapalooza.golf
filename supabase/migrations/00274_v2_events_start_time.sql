-- Events can carry a start TIME (e.g. the first tee time), not just a start DATE.
--
-- The home-page countdown previously could only target midnight of the start
-- date; with a real start time it counts down to the actual kickoff and the
-- "Underway" flip happens at that moment instead of 00:00. Nullable — events
-- without a set time keep the midnight behavior. Interpreted in the viewer's
-- local timezone (same as the existing date handling); a per-event timezone is a
-- separate, tracked follow-up (#234).

ALTER TABLE public.v2_events ADD COLUMN IF NOT EXISTS start_time TIME;
