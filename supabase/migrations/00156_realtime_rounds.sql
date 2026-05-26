-- Issue #132. Subscribe `round_scores`, `round_players`, and `rounds` to
-- the supabase_realtime publication so the live scorer can react to writes
-- from other devices in the same group. Idempotent (no-op on re-run).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'round_scores'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_scores;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'round_players'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.round_players;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rounds'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;
  END IF;
END $$;
