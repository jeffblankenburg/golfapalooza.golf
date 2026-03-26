-- Add likelihood column to event_participants for user self-RSVP
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS likelihood SMALLINT;
-- Values: 99 (Attending), 75 (Probable), 50 (Questionable), 25 (Doubtful), NULL (not yet indicated)

-- Allow users to manage their own participation
CREATE POLICY "Users can insert own participation"
  ON public.event_participants FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own participation"
  ON public.event_participants FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own participation"
  ON public.event_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid());
