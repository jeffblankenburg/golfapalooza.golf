-- Composition tee mappings: for each hole, which source tee to use
CREATE TABLE IF NOT EXISTS public.composition_tee_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_id UUID NOT NULL REFERENCES public.course_tees(id) ON DELETE CASCADE,
  hole_number SMALLINT NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  source_tee_id UUID NOT NULL REFERENCES public.course_tees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tee_id, hole_number)
);

CREATE INDEX idx_composition_tee_mappings_tee ON public.composition_tee_mappings(tee_id);

ALTER TABLE public.composition_tee_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read composition_tee_mappings"
  ON public.composition_tee_mappings
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage composition_tee_mappings"
  ON public.composition_tee_mappings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
