-- Add Calcutta auction fields to contest_participants
ALTER TABLE public.contest_participants ADD COLUMN IF NOT EXISTS auction_order SMALLINT;
ALTER TABLE public.contest_participants ADD COLUMN IF NOT EXISTS bid_amount DECIMAL(10,2);
ALTER TABLE public.contest_participants ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id);
ALTER TABLE public.contest_participants ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- Track which participant is currently being auctioned
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS calcutta_active_order SMALLINT;

-- Calcutta prize breakdown configuration
CREATE TABLE IF NOT EXISTS public.calcutta_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  prize_name VARCHAR(100) NOT NULL,
  place SMALLINT NOT NULL DEFAULT 1,
  percentage DECIMAL(5,2) NOT NULL,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.calcutta_prizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calcutta prizes"
  ON public.calcutta_prizes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage calcutta prizes"
  ON public.calcutta_prizes FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
