-- ===========================================
-- Financial Contests
-- Lightweight named buckets for tracking money
-- across non-trip contests (Super Bowl pools,
-- NFL weekly, fantasy football, brackets, etc.)
-- ===========================================

-- 1. Create financial_contests table
CREATE TABLE IF NOT EXISTS public.financial_contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  contest_date DATE,  -- when the contest ends; used for sort order
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_financial_contests_date ON public.financial_contests(contest_date DESC NULLS LAST);

ALTER TABLE public.financial_contests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial_contests"
  ON public.financial_contests FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage financial_contests"
  ON public.financial_contests FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- 2. Add financial_contest_id to financial_transactions
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS financial_contest_id UUID REFERENCES public.financial_contests(id) ON DELETE SET NULL;

CREATE INDEX idx_financial_transactions_contest
  ON public.financial_transactions(financial_contest_id)
  WHERE financial_contest_id IS NOT NULL;
