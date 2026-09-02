-- Add `kgb_cup_hole_scores` to the supabase_realtime publication so pages that
-- react to KGB Cup scoring writes (the Boland Bet page) get live push updates
-- instead of only refreshing on navigation. Idempotent (no-op on re-run).
-- REPLICA IDENTITY FULL so DELETE events (a cleared score) carry the old row,
-- letting subscribers filter on hole_number.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'kgb_cup_hole_scores'
  ) THEN
    ALTER TABLE public.kgb_cup_hole_scores REPLICA IDENTITY FULL;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kgb_cup_hole_scores;
  END IF;
END $$;
