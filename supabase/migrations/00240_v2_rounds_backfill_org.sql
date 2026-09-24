-- Backfill org_id on org-less rounds.
--
-- Some early / personal rounds were created before rounds carried an org_id, so
-- they have org_id = NULL and show no group name/logo on the scorecard image and
-- activity feed. At this point every round belongs to Golfapalooza, so attribute
-- the null ones to it — they then display correctly through the normal path (no
-- display-time fallback needed).

UPDATE public.v2_rounds
SET org_id = (SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1)
WHERE org_id IS NULL;
