-- Track whether each winning owner has been paid out for a specific prize
CREATE TABLE IF NOT EXISTS public.calcutta_winner_paid (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id UUID NOT NULL REFERENCES public.calcutta_prizes(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(prize_id, owner_id)
);

ALTER TABLE public.calcutta_winner_paid ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calcutta winner paid"
  ON public.calcutta_winner_paid FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage calcutta winner paid"
  ON public.calcutta_winner_paid FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
