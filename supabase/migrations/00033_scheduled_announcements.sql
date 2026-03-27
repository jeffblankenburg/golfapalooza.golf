-- Migration: Broadcast lists and scheduled announcements

-- ============================================================================
-- 1. BROADCAST LISTS — saved custom recipient lists
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.broadcast_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_ids jsonb NOT NULL DEFAULT '[]',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.broadcast_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read broadcast lists"
  ON public.broadcast_lists FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can manage broadcast lists"
  ON public.broadcast_lists FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- ============================================================================
-- 2. SCHEDULED ANNOUNCEMENTS — future-dated notifications
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.scheduled_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  audience_type text NOT NULL CHECK (audience_type IN ('everyone', 'event', 'custom')),
  audience_user_ids jsonb,
  trip_id uuid REFERENCES public.trip_settings(id) ON DELETE SET NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE public.scheduled_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read scheduled announcements"
  ON public.scheduled_announcements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can manage scheduled announcements"
  ON public.scheduled_announcements FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_scheduled_announcements_pending
  ON public.scheduled_announcements (status, scheduled_for)
  WHERE status = 'pending';
