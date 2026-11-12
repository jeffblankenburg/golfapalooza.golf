-- 00294_v2_threes_and_ds.sql
--
-- #246: "3s and Ds" — a live event-caller + big-screen board for the basketball
-- wager. NOT a buy-in contest: no entry fee, no pot, no enrollment, no ledger.
-- A room full of pairs settle their own cash; the app just calls the events and
-- runs an entertaining board. It reuses the contest spine (one no-fee manual
-- activity row), the ESPN slate (one v2_matchups row = the current game, for the
-- live score + team logos), and this new event log.

-- 1) Open the contest_type CHECK to add '3s_and_ds'.
ALTER TABLE public.v2_contests DROP CONSTRAINT IF EXISTS v2_contests_contest_type_check;
ALTER TABLE public.v2_contests ADD CONSTRAINT v2_contests_contest_type_check
  CHECK (contest_type IN (
    'scramble','skins','ctp','long_drive','long_putt',
    'bspitw','hundred_feet','ryder_cup','calcutta',
    'cornhole','pickem','squares','auction','props','3s_and_ds','other'));

-- 2) Event log: one row per scorer tap. `team` is which side executed the play
--    (a = ESPN away, b = home). `points` is the positive multiplier (1/2/3) and
--    `result` says whether the executing team WINS (collects) or OWES. The board
--    derives the unit differential + streaks from these; undo deletes the latest.
DROP TABLE IF EXISTS public.v2_3s_events CASCADE;
CREATE TABLE public.v2_3s_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id  UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  matchup_id  UUID NOT NULL REFERENCES public.v2_matchups(id) ON DELETE CASCADE,
  team        TEXT NOT NULL CHECK (team IN ('a','b')),
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'three_point_play','dunk','four_point_play','half_court','buzzer_beater',
    'airball_backcourt','airball_frontcourt','missed_dunk')),
  points      SMALLINT NOT NULL,
  result      TEXT NOT NULL CHECK (result IN ('win','owe')),
  created_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_3s_events_contest ON public.v2_3s_events(contest_id, created_at);
CREATE INDEX idx_v2_3s_events_matchup ON public.v2_3s_events(matchup_id);

-- Permissive RLS, API-gated writes (mirrors props/pickem). Admin/operator tool,
-- not spectator-facing — no anon grant.
ALTER TABLE public.v2_3s_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_3s_events_all" ON public.v2_3s_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_3s_events TO authenticated, service_role;

-- Realtime: the board + scorer console subscribe so a tap shows instantly.
-- FULL replica identity so DELETE (undo) events carry the old row.
ALTER TABLE public.v2_3s_events REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_3s_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
