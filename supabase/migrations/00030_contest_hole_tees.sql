-- Maps each (contest, hole) to a tee box for tee assignment per contest
-- KGB Cup: 18 rows all same tee_id; Scramble: 18 rows with mixed tees

DROP TABLE IF EXISTS public.contest_hole_tees;

CREATE TABLE public.contest_hole_tees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  hole_number SMALLINT NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  tee_id UUID NOT NULL REFERENCES public.course_tees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contest_id, hole_number)
);

-- Indexes
CREATE INDEX idx_contest_hole_tees_contest_id ON public.contest_hole_tees(contest_id);
CREATE INDEX idx_contest_hole_tees_tee_id ON public.contest_hole_tees(tee_id);

-- RLS
ALTER TABLE public.contest_hole_tees ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read contest_hole_tees"
  ON public.contest_hole_tees
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage
CREATE POLICY "Admins can manage contest_hole_tees"
  ON public.contest_hole_tees
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
