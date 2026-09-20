-- 00230_v2_rounds_org.sql
-- Stamp a round with the group it was logged under (the /new/{slug} context at
-- creation). Rounds stay personal & global — org_id is ONLY for social routing
-- (activity feed + notifications), not access control. Nullable: imported/
-- historical rounds (00225) have none and simply don't surface socially.

ALTER TABLE public.v2_rounds
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.v2_organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_v2_rounds_org ON public.v2_rounds (org_id);
