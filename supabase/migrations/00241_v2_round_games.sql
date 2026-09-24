-- v2 My Rounds side games (#183): lightweight, no-money competitions among a
-- round's players (Skins first; Nassau/Wolf/etc. later). Only the game DEFINITION
-- is stored — live standings are derived from v2_round_scores, so nothing here
-- needs updating as holes are scored.

DROP TABLE IF EXISTS public.v2_round_games;

CREATE TABLE public.v2_round_games (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id        UUID NOT NULL REFERENCES public.v2_rounds(id) ON DELETE CASCADE,
  game_type       TEXT NOT NULL,                         -- 'skins' (more to come)
  is_net          BOOLEAN NOT NULL DEFAULT false,        -- net uses each player's course handicap
  participant_ids UUID[] NOT NULL DEFAULT '{}',          -- v2_round_players.id who are IN this game
  config          JSONB NOT NULL DEFAULT '{}',           -- game-specific options
  created_by      UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_v2_round_games_round ON public.v2_round_games(round_id);

ALTER TABLE public.v2_round_games ENABLE ROW LEVEL SECURITY;

-- Co-equal round ownership: any authed user can read/manage a round's games
-- (mirrors v2_round_scores' permissive policy; the API gates on round access).
CREATE POLICY "v2_round_games_all" ON public.v2_round_games FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_round_games TO authenticated, service_role;

-- Realtime so a game started on one device appears on the others mid-round.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'v2_round_games'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_round_games;
  END IF;
END $$;
