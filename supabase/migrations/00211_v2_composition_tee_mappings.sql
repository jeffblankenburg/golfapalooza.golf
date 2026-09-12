-- Hybrid / "composition" tees for the universal v2 library. A hybrid tee (e.g.
-- "Blue/Black") plays some holes from one tee grouping and some from another,
-- WITHOUT duplicating hole data: each hole just points at the source tee whose
-- hole data it uses. Mirrors the original composition_tee_mappings (00094).
--
-- The hybrid is a normal v2_course_tees row (its own name/color/rating/slope/par);
-- these rows override, per hole, which source tee's hole to read. Resolution is
-- transparent via src/lib/v2/courses/composition-tees.ts.

DROP TABLE IF EXISTS public.v2_composition_tee_mappings;

CREATE TABLE public.v2_composition_tee_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_id        UUID NOT NULL REFERENCES public.v2_course_tees(id) ON DELETE CASCADE,
  hole_number   SMALLINT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  source_tee_id UUID NOT NULL REFERENCES public.v2_course_tees(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tee_id, hole_number)
);
CREATE INDEX idx_v2_composition_tee_mappings_tee ON public.v2_composition_tee_mappings(tee_id);

-- Universal library: any authenticated user reads and writes (matches v2 courses).
ALTER TABLE public.v2_composition_tee_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_composition_tee_mappings_all" ON public.v2_composition_tee_mappings FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_composition_tee_mappings TO authenticated, service_role;
