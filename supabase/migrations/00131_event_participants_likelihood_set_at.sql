-- Track when each user set their RSVP likelihood. Powers the "Date Signed" column
-- on the home-page participants box.
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS likelihood_set_at TIMESTAMPTZ;

-- Backfill: rows that already have a likelihood get their original created_at.
-- (For users who later changed their answer we don't have history; created_at is
-- the closest approximation.)
UPDATE public.event_participants
SET likelihood_set_at = created_at
WHERE likelihood IS NOT NULL
  AND likelihood_set_at IS NULL;
