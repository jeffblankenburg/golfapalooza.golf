-- 00286_v2_contests_realtime.sql
-- Publish v2_contests to Supabase realtime so config changes push live. The auction's
-- "on the block" lot + the complete flag live in v2_contests.config; the projectable
-- board and member board subscribe to this table to update the instant the admin puts a
-- team up or closes the auction. RLS still governs what each subscriber receives.

ALTER TABLE public.v2_contests REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_contests;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
