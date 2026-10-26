-- Add v2_auction_teams to the supabase_realtime publication so the live auction board and
-- recorder react immediately to every assign/undo — not just the ones that also clear the
-- lot on the block (a v2_contests config change). Without this, undoing a buy (which touches
-- no config) and some assigns would not advance the nominator on the board until a manual
-- refresh. Idempotent; the SQL linter's ALTER PUBLICATION warning is a T-SQL false positive.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'v2_auction_teams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_auction_teams;
  END IF;
END $$;

-- Realtime needs the full row image for filtered subscriptions / deletes.
ALTER TABLE public.v2_auction_teams REPLICA IDENTITY FULL;
