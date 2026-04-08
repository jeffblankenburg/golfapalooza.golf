-- Admin-entered scramble stats per user per trip (for Calcutta display)
CREATE TABLE IF NOT EXISTS public.user_scramble_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  eight_bag_average NUMERIC(4,1),
  avg_scramble_score NUMERIC(4,1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, trip_id)
);

ALTER TABLE public.user_scramble_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scramble stats"
  ON public.user_scramble_stats FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage scramble stats"
  ON public.user_scramble_stats FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_user_scramble_stats_trip ON public.user_scramble_stats(trip_id);
CREATE INDEX idx_user_scramble_stats_user ON public.user_scramble_stats(user_id);

CREATE TRIGGER user_scramble_stats_updated_at
  BEFORE UPDATE ON public.user_scramble_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
