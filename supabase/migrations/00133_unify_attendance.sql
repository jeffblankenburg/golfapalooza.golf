-- Unify attendance under event_participants. Historical workbook rows
-- become roster rows with on_roster=true and likelihood=NULL (they attended,
-- but didn't RSVP through the app). Idempotent — safe to re-run, and rows
-- already in event_participants are left untouched.
--
-- We deliberately leave the `event_attendance` table in place for now as a
-- backup. A follow-up migration can DROP it once we've verified the unified
-- table covers every read path.

INSERT INTO public.event_participants (trip_id, user_id, on_roster, likelihood, created_at)
SELECT ea.trip_id, ea.user_id, true, NULL, ea.created_at
FROM public.event_attendance ea
ON CONFLICT (trip_id, user_id) DO NOTHING;
