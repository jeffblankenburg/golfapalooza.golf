-- Per-Loozer trip attendance. Phase 1b of issue #114 — sources from the
-- Attendance sheet of `Golfapalooza History.xlsx`. One row per (user, trip)
-- attended. The historical importer fills this in for years 1997–<latest>;
-- future code (e.g. trip-archiver hooks) can fold in modern attendance.

CREATE TABLE IF NOT EXISTS public.event_attendance (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'workbook',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trip_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendance_user_id
  ON public.event_attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendance_trip_id
  ON public.event_attendance(trip_id);

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can read attendance (it's fundamentally public Loozer history).
DROP POLICY IF EXISTS "event_attendance_read" ON public.event_attendance;
CREATE POLICY "event_attendance_read"
  ON public.event_attendance FOR SELECT
  TO authenticated
  USING (true);

-- Writes go through the service role only (admin importer + future trip hooks).
