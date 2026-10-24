-- 00282_drop_legacy_pickem_tables.sql
--
-- #224 cleanup: Pick'em now runs entirely on the generic slate substrate
-- (v2_matchups / v2_picks, backfilled in 00281 and verified live). The legacy
-- per-type tables are no longer read or written by any code — drop them.
-- (v2_pickem_payouts is a SEPARATE winnings table, not part of the slate — kept.)

DROP TABLE IF EXISTS public.v2_pickem_picks CASCADE;
DROP TABLE IF EXISTS public.v2_pickem_games CASCADE;
