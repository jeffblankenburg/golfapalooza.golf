-- Issue #125 follow-up — distinguish "no result entered yet" from
-- "explicitly nobody won this contest" on per-day daily contests.
--
-- Use case: closest-to-the-pin / long drive can have a day where nobody
-- hits the green / lands a qualifying drive. The pot then carries to the
-- other side same day (CTP only), or to the next day's pot, or to next
-- year's budget on Saturday. The carry logic lives in
-- src/lib/winners/daily-pots.ts and reads this flag.
--
-- Long putt always has a winner; this flag is meaningful only for
-- ctp_front, ctp_back, and long_drive contests.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS declared_no_winner BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.contests.declared_no_winner IS
  'When true, an admin has explicitly recorded "nobody won" for this contest. Distinct from the not-yet-decided default. Daily-pot carries trigger off this flag (see src/lib/winners/daily-pots.ts). Mutually exclusive with contest_winners rows: setting this true clears any prior winners.';
