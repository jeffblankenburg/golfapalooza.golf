-- ===========================================
-- Financial Contest Participants & Entry Fees
-- ===========================================

-- 1. Add entry_fee to financial_contests
ALTER TABLE public.financial_contests
  ADD COLUMN IF NOT EXISTS entry_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Create financial_contest_participants junction table
CREATE TABLE IF NOT EXISTS public.financial_contest_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_contest_id UUID NOT NULL REFERENCES public.financial_contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(financial_contest_id, user_id)
);

CREATE INDEX idx_fcp_contest ON public.financial_contest_participants(financial_contest_id);
CREATE INDEX idx_fcp_user ON public.financial_contest_participants(user_id);

ALTER TABLE public.financial_contest_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial_contest_participants"
  ON public.financial_contest_participants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage financial_contest_participants"
  ON public.financial_contest_participants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- 3. Expand the source CHECK constraint on financial_transactions
--    to allow 'contest_entry' for auto-generated entry fee charges
ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_source_check;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_source_check
  CHECK (source IN ('option', 'manual', 'adjustment', 'contest_entry'));
