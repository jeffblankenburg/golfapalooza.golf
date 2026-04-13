-- Add tee time reminder setting to trip_settings
ALTER TABLE public.trip_settings
  ADD COLUMN IF NOT EXISTS tee_time_reminder_minutes SMALLINT NOT NULL DEFAULT 30;

-- Track which tee time reminders have been sent to avoid duplicates
CREATE TABLE IF NOT EXISTS public.tee_time_reminders_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_time_id UUID NOT NULL REFERENCES public.tee_times(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tee_time_id, user_id)
);

CREATE INDEX idx_tee_time_reminders_sent_tee_time ON public.tee_time_reminders_sent(tee_time_id);

ALTER TABLE public.tee_time_reminders_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage tee_time_reminders_sent"
  ON public.tee_time_reminders_sent
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
