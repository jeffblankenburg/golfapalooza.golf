-- 00262 v2 scoring metrics catalog (#220)
-- A super-admin (system-admin) curated catalog of per-player scoring observations
-- that a scramble scorer can collect (greens hit, holed out, distance to pin, ...).
-- Group admins pick which metrics a CONSUMING contest (BSPITW / 100 Feet / CTP)
-- collects; the scramble scorer then surfaces the union. Each metric carries a
-- description so group admins understand what it means.
--
-- Also relaxes the hardcoded metric CHECK on v2_contest_observations so new catalog
-- keys are storable (validation moves to the app, against this catalog).

DROP TABLE IF EXISTS public.v2_scoring_metrics CASCADE;

CREATE TABLE public.v2_scoring_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,          -- stable slug stored in v2_contest_observations.metric
  label       TEXT NOT NULL,                 -- display name on the scorer toggle
  description TEXT,                           -- explanation shown to group admins
  value_type  TEXT NOT NULL DEFAULT 'flag'   -- 'flag' (0/1), 'distance' (inches), 'count'
              CHECK (value_type IN ('flag', 'distance', 'count')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_v2_scoring_metrics_active ON public.v2_scoring_metrics(is_active, sort_order);

-- Seed the three metrics the observations store originally hardcoded.
INSERT INTO public.v2_scoring_metrics (key, label, description, value_type, sort_order) VALUES
  ('on_green',    'Greens hit',    'The player''s shot finished on the green for this hole.',        'flag',     0),
  ('holed_out',   'Holed out',     'The player sank the putt (made the shot) on this hole.',          'flag',     1),
  ('distance_in', 'Distance to pin','Measured distance of the player''s shot from the hole, in inches.','distance', 2)
ON CONFLICT (key) DO NOTHING;

-- Relax the observations metric constraint: the catalog is now the source of truth.
ALTER TABLE public.v2_contest_observations DROP CONSTRAINT IF EXISTS v2_contest_observations_metric_check;

ALTER TABLE public.v2_scoring_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_scoring_metrics_read" ON public.v2_scoring_metrics FOR SELECT TO authenticated USING (true);

GRANT SELECT ON TABLE public.v2_scoring_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_scoring_metrics TO service_role;
