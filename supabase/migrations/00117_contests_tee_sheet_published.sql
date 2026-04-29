-- Add a per-contest "tee sheet published" flag so admins can withhold team
-- assignments and tee times from the public Scorecards page until they're
-- ready to share them. Null = hidden, timestamp = published-at moment.
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS tee_sheet_published_at TIMESTAMPTZ;
