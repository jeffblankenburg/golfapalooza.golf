-- 00288_v2_contest_participants_realtime.sql
-- Publish v2_contest_participants to Supabase realtime so entrant-count changes push live.
-- The member Pick'em board's pot = entry x entrants, so a member joining or leaving shifts
-- the pot and everyone's projected winnings. The board subscribes realtime-only (no poll),
-- so this table must propagate INSERT and DELETE to keep the pot correct on open boards.
-- REPLICA IDENTITY FULL so a DELETE's old row carries contest_id (not just the PK) and the
-- board's contest_id=eq.<id> filter matches when a member leaves. RLS still governs delivery.

ALTER TABLE public.v2_contest_participants REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_contest_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
