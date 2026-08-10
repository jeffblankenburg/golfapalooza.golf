-- 00172_contests_hole_number.sql
-- Adds the hole that hosts a per-day daily contest. Only meaningful for the
-- four daily contest types (ctp_front, ctp_back, long_drive, long_putt);
-- NULL for every other contest type. One hole per daily contest — the front/
-- back CTP split plus single-hole Long Drive / Long Putt is the whole model.
-- Surfaced on the Daily Games page and (matched by course + date) as a badge
-- in the live scoring view.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS hole_number SMALLINT
  CHECK (hole_number IS NULL OR (hole_number >= 1 AND hole_number <= 18));

COMMENT ON COLUMN public.contests.hole_number IS
  'Hole (1-18) hosting a daily contest (ctp_front/ctp_back/long_drive/long_putt). NULL for non-daily contests and for daily contests without an assigned hole.';
