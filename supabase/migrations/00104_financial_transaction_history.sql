-- ===========================================
-- Financial Transaction Audit History
-- Logs every edit and deletion with before/after state
-- ===========================================

CREATE TABLE IF NOT EXISTS public.financial_transaction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('edit', 'delete')),
  changed_by UUID NOT NULL REFERENCES public.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Snapshot of the transaction BEFORE the change
  previous_type VARCHAR(10),
  previous_source VARCHAR(20),
  previous_description TEXT,
  previous_amount NUMERIC(10,2),
  previous_method VARCHAR(20),
  previous_notes TEXT,
  previous_financial_contest_id UUID,
  previous_trip_id UUID
);

CREATE INDEX idx_fth_transaction ON public.financial_transaction_history(transaction_id);
CREATE INDEX idx_fth_changed_by ON public.financial_transaction_history(changed_by);

ALTER TABLE public.financial_transaction_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read financial_transaction_history"
  ON public.financial_transaction_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE POLICY "Admins can manage financial_transaction_history"
  ON public.financial_transaction_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));
