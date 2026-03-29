-- Fix: allow users to delete their own notifications (was missing, so deletes silently failed)
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Enable full replica identity so realtime DELETE events include all columns
-- (needed for user_id filter on realtime subscriptions)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
