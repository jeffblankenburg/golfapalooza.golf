-- v2 financials single-source (#213). The buy-in amount now lives ONLY in
-- v2_cost_items (one row per contest/side game, keyed by source_type/source_id).
-- Drop the duplicated amount column off v2_contests so there is exactly one place
-- a dollar figure is stored. The contest's buy-in field reads/writes its cost item.
--
-- Backfill first: any existing buy-in on a contest becomes (or updates) its
-- projected cost item, so nothing is lost when the column goes away.

-- 1) Backfill cost items from any contest that still carries a buy-in and lacks one.
INSERT INTO public.v2_cost_items (org_id, event_id, name, amount_cents, category, source_type, source_id, created_by)
SELECT c.org_id, c.event_id, c.name, c.entry_amount_cents,
       CASE WHEN c.parent_contest_id IS NULL THEN 'contest' ELSE 'side_game' END,
       CASE WHEN c.parent_contest_id IS NULL THEN 'contest' ELSE 'side_game' END,
       c.id, c.created_by
FROM public.v2_contests c
WHERE c.entry_amount_cents IS NOT NULL
  AND c.entry_amount_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.v2_cost_items ci
    WHERE ci.source_id = c.id
      AND ci.source_type IN ('contest', 'side_game')
  );

-- 2) Keep any already-projected cost item in step with the contest's amount.
UPDATE public.v2_cost_items ci
SET amount_cents = c.entry_amount_cents, updated_at = NOW()
FROM public.v2_contests c
WHERE ci.source_id = c.id
  AND ci.source_type IN ('contest', 'side_game')
  AND c.entry_amount_cents IS NOT NULL
  AND c.entry_amount_cents > 0
  AND ci.amount_cents <> c.entry_amount_cents;

-- 3) Drop the now-duplicated column. cost_items is the single source of truth.
ALTER TABLE public.v2_contests DROP COLUMN IF EXISTS entry_amount_cents;
