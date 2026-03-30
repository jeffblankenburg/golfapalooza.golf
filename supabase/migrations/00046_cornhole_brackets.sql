-- Cornhole bracket matches (single & double elimination tournaments)
CREATE TABLE IF NOT EXISTS public.cornhole_bracket_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  bracket_type TEXT NOT NULL CHECK (bracket_type IN ('main', 'winners', 'losers', 'championship')),
  round_number INT NOT NULL,
  match_number INT NOT NULL,
  slot1_participant_id UUID,
  slot2_participant_id UUID,
  winner_participant_id UUID,
  slot1_score INT,
  slot2_score INT,
  next_winner_match_id UUID REFERENCES public.cornhole_bracket_matches(id) ON DELETE SET NULL,
  next_winner_slot INT CHECK (next_winner_slot IN (1, 2)),
  next_loser_match_id UUID REFERENCES public.cornhole_bracket_matches(id) ON DELETE SET NULL,
  next_loser_slot INT CHECK (next_loser_slot IN (1, 2)),
  is_bye BOOLEAN DEFAULT FALSE,
  seed1 INT,
  seed2 INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, bracket_type, round_number, match_number)
);

ALTER TABLE public.cornhole_bracket_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read bracket matches"
  ON public.cornhole_bracket_matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage bracket matches"
  ON public.cornhole_bracket_matches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE INDEX idx_bracket_matches_contest ON public.cornhole_bracket_matches(contest_id);
