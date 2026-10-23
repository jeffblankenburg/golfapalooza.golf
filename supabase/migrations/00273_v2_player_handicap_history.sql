-- v2 handicap audit trail — one row per recalculation of a golfer's index.
--
-- Parity gap (#234): the v2 recalc pipeline (src/lib/v2/golf/handicap.ts) upserts
-- the current index but, unlike v1 (handicap_history, migration 00002), kept no
-- history. This restores the audit log so a golfer's index over time + exactly
-- which differentials produced it can be reviewed. Personal & global (one golfer,
-- not org-scoped), matching v2_player_handicaps.

DROP TABLE IF EXISTS public.v2_player_handicap_history;
CREATE TABLE public.v2_player_handicap_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  handicap_index      DECIMAL(3, 1) NOT NULL,
  low_handicap_index  DECIMAL(3, 1),
  rounds_used         INTEGER NOT NULL,
  total_rounds        INTEGER,
  differentials_used  JSONB,
  calculation_method  VARCHAR(50),
  effective_date      DATE NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_v2_player_handicap_history_user
  ON public.v2_player_handicap_history (user_id, effective_date DESC);

ALTER TABLE public.v2_player_handicap_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_player_handicap_history_all" ON public.v2_player_handicap_history FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_player_handicap_history TO authenticated, service_role;
