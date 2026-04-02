-- Calcutta ownership table: supports multiple owners per participant (buybacks, group buys)
CREATE TABLE IF NOT EXISTS public.calcutta_ownership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.contest_participants(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  share_pct DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  amount_paid DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_buyback BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.calcutta_ownership ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calcutta ownership"
  ON public.calcutta_ownership FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage calcutta ownership"
  ON public.calcutta_ownership FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
