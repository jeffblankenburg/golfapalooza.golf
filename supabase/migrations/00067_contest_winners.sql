-- Contest winners & Calcutta payout resolution
-- Stores resolved winners for each calcutta prize, adds contest locking,
-- and adds resolution_type to calcutta_prizes for auto-resolution.

-- A. contest_winners table
CREATE TABLE IF NOT EXISTS public.contest_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id UUID NOT NULL REFERENCES public.calcutta_prizes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  place SMALLINT NOT NULL DEFAULT 1,
  is_playoff BOOLEAN DEFAULT false,
  notes TEXT,
  resolved_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE(prize_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_contest_winners_prize_id ON public.contest_winners(prize_id);
CREATE INDEX IF NOT EXISTS idx_contest_winners_user_id ON public.contest_winners(user_id);

ALTER TABLE public.contest_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read contest winners"
  ON public.contest_winners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage contest winners"
  ON public.contest_winners FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- B. Contest locking columns
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS winners_locked_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS winners_locked_by UUID
    REFERENCES public.users(id) ON DELETE SET NULL DEFAULT NULL;

-- C. Resolution type on calcutta_prizes
ALTER TABLE public.calcutta_prizes
  ADD COLUMN IF NOT EXISTS resolution_type VARCHAR(30) DEFAULT NULL;
