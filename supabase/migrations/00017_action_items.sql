-- Action items (admin-defined tasks for users)
CREATE TABLE IF NOT EXISTS public.action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  deadline DATE,
  link VARCHAR(200),
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read action items"
  ON public.action_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage action items"
  ON public.action_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- User action completions (tracks who finished what)
CREATE TABLE IF NOT EXISTS public.user_action_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id UUID NOT NULL REFERENCES public.action_items(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(action_item_id, user_id)
);

ALTER TABLE public.user_action_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read action completions"
  ON public.user_action_completions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own completions"
  ON public.user_action_completions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own completions"
  ON public.user_action_completions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all completions"
  ON public.user_action_completions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));
