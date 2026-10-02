-- 00258_v2_dedupe_trip_cost.sql
-- Fix the Trip Cost pileup: ensureTripCostOption used .maybeSingle(), which returns
-- null when >1 row matches, so once two Trip Cost options existed it inserted a new one
-- on every page load (the admin UI hid them behind a neq('trip_cost') filter until that
-- filter was removed). This collapses the duplicates to one per event (keeping the
-- earliest), repoints any option that depended on a doomed Trip Cost to the survivor
-- (depends_on_option_id is ON DELETE SET NULL, so we must repoint BEFORE deleting), and
-- adds a partial unique index so a second Trip Cost per event can never be created again.
-- v2_user_option_selections.option_id is ON DELETE CASCADE, so stray trip-cost selections
-- (there shouldn't be any — Trip Cost isn't member-selectable) clean up automatically.

-- 1. Repoint dependents to the earliest Trip Cost in their event.
WITH survivor AS (
  SELECT DISTINCT ON (event_id) event_id, id
  FROM public.v2_options
  WHERE option_type = 'trip_cost'
  ORDER BY event_id, created_at ASC
),
doomed AS (
  SELECT o.id, s.id AS survivor_id
  FROM public.v2_options o
  JOIN survivor s ON s.event_id = o.event_id
  WHERE o.option_type = 'trip_cost' AND o.id <> s.id
)
UPDATE public.v2_options dep
SET depends_on_option_id = d.survivor_id, updated_at = NOW()
FROM doomed d
WHERE dep.depends_on_option_id = d.id;

-- 2. Delete the duplicate Trip Cost options (keep the earliest per event).
DELETE FROM public.v2_options o
USING (
  SELECT DISTINCT ON (event_id) event_id, id
  FROM public.v2_options
  WHERE option_type = 'trip_cost'
  ORDER BY event_id, created_at ASC
) keep
WHERE o.option_type = 'trip_cost'
  AND o.event_id = keep.event_id
  AND o.id <> keep.id;

-- 3. Guard: at most one Trip Cost option per event, forever.
DROP INDEX IF EXISTS public.idx_v2_options_one_trip_cost;
CREATE UNIQUE INDEX idx_v2_options_one_trip_cost
  ON public.v2_options (event_id)
  WHERE option_type = 'trip_cost';
