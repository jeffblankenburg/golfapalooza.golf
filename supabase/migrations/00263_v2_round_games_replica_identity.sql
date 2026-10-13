-- Multi-device Wolf (#222): v2_round_games is already in the supabase_realtime
-- publication (00241), but without REPLICA IDENTITY FULL a DELETE's old-row only
-- carries the primary key. The round channel filters on round_id=eq.<id>, so
-- deletes (and full old-row data) wouldn't reach other devices. Match the other
-- round tables (00227) so game INSERT/UPDATE/DELETE all propagate.
ALTER TABLE public.v2_round_games REPLICA IDENTITY FULL;
