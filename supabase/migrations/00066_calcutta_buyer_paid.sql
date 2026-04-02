-- Track whether each buyer has paid their Calcutta auction balance
CREATE TABLE IF NOT EXISTS public.calcutta_buyer_paid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, user_id)
);

ALTER TABLE public.calcutta_buyer_paid ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calcutta buyer paid"
  ON public.calcutta_buyer_paid FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage calcutta buyer paid"
  ON public.calcutta_buyer_paid FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
