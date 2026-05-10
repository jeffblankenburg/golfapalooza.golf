-- Issue #126 — admin sandbox: add the 'test' status to trip_settings.
--
-- Today `trip_settings.status` is an unconstrained VARCHAR(20) with default
-- 'active'. We've been relying on convention (draft / active / archived) but
-- nothing enforces it. This migration:
--
--   1. Backfills any row whose current status isn't one of the known values
--      to 'archived' (defensive — should be a no-op on a healthy DB).
--   2. Adds a CHECK constraint that includes the new 'test' status.
--
-- After this lands, admins can create one permanent test event with
-- `status = 'test'`. User-facing queries all filter `status = 'active'`,
-- so the test event is invisible to Loozers by default; admins opt into
-- viewing it via the `sim-trip-id` cookie (see `getEffectiveTripId()`
-- in `src/lib/simulator.ts`).

-- 1. Defensive backfill — anything not in the canonical set becomes 'archived'.
UPDATE public.trip_settings
SET status = 'archived'
WHERE status IS NULL
   OR status NOT IN ('draft', 'active', 'archived', 'test');

-- 2. Add the CHECK constraint. Drop first in case a future re-run hits a
--    constraint of the same name (defensive — no constraint exists today).
ALTER TABLE public.trip_settings
  DROP CONSTRAINT IF EXISTS trip_settings_status_check;

ALTER TABLE public.trip_settings
  ADD CONSTRAINT trip_settings_status_check
  CHECK (status IN ('draft', 'active', 'archived', 'test'));
