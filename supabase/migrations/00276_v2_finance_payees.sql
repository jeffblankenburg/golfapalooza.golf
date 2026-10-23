-- Finance epic #235 / #236: attach a PAYEE to every obligation.
--
-- Today money is one pot per event and payments aren't tied to who collects them.
-- These columns let a contest name a collector and an event name a treasurer, and
-- let a ledger payment record WHO received it and WHAT it was for — so a member can
-- owe different people and settle up with each (the unified "My Money" screen).
--
-- NULL = "use the default": an event's payee falls back to its creator; a
-- contest's falls back to its event's treasurer, then its own creator. Resolved in
-- code (src/lib/v2/finance/payees.ts) so no backfill is needed here.

-- Event treasurer — default payee for the event's trip cost / options / charges.
ALTER TABLE public.v2_events
  ADD COLUMN IF NOT EXISTS treasurer_user_id UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL;

-- Per-contest collector — overrides the treasurer for THIS contest's buy-in.
ALTER TABLE public.v2_contests
  ADD COLUMN IF NOT EXISTS collected_by UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL;

-- Ledger: a payment can now record its recipient + what it settled, and belong to
-- a group-scoped (event-less) obligation. org_id is already NOT NULL on this table.
ALTER TABLE public.v2_financial_transactions ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE public.v2_financial_transactions
  ADD COLUMN IF NOT EXISTS payee_user_id UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.v2_financial_transactions
  ADD COLUMN IF NOT EXISTS contest_id UUID REFERENCES public.v2_contests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_v2_fin_tx_payee ON public.v2_financial_transactions(payee_user_id) WHERE payee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_v2_fin_tx_contest ON public.v2_financial_transactions(contest_id) WHERE contest_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_v2_fin_tx_user ON public.v2_financial_transactions(user_id);
