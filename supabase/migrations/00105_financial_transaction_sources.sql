-- ===========================================
-- Expand financial_transactions.source taxonomy
-- ===========================================
-- Introduces specific sources so deposits, winnings, credits, and
-- expenses are no longer indistinguishable under the generic 'manual'.
--
--   deposit     — real money coming in (user pays admin)
--   withdrawal  — real money going out (admin pays user)
--   winnings    — internal redistribution: contest payout
--   credit      — internal redistribution: admin reduces what user owes
--   expense     — admin-added charge (not tied to a trip option)
--
-- System-generated sources (option, contest_entry, adjustment) are
-- unchanged. 'manual' stays in the allowlist as a legacy bucket for
-- pre-existing rows we don't auto-classify.

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_source_check;

ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_source_check
  CHECK (source IN (
    'option',
    'manual',
    'adjustment',
    'contest_entry',
    'deposit',
    'withdrawal',
    'winnings',
    'credit',
    'expense'
  ));

-- Safe backfill: the app has always written these descriptions verbatim.
UPDATE public.financial_transactions
   SET source = 'deposit'
 WHERE source = 'manual'
   AND type = 'payment'
   AND description LIKE 'Deposit via%';

UPDATE public.financial_transactions
   SET source = 'withdrawal'
 WHERE source = 'manual'
   AND type = 'charge'
   AND description LIKE 'Withdrawal via%';
