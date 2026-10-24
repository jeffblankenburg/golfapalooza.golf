-- 00284_v2_auction.sql
--
-- #227: the Auction — a standalone group/event contest (third type, beside Squares +
-- Pick'em). Participants bid fake money (salary cap) to own entities drafted one at a
-- time; later, points = Σ (entity.seed × entity.wins). The entity catalog is a shared
-- tournament's field (config.tournament_id → v2_tournament_teams), so no bespoke team
-- store. Ownership lives here; $0 rows are bonus teams (don't count toward teams_per_player).

-- 1) Open the contest_type CHECK to add 'auction'.
ALTER TABLE public.v2_contests DROP CONSTRAINT IF EXISTS v2_contests_contest_type_check;
ALTER TABLE public.v2_contests ADD CONSTRAINT v2_contests_contest_type_check
  CHECK (contest_type IN (
    'scramble','skins','ctp','long_drive','long_putt',
    'bspitw','hundred_feet','ryder_cup','calcutta',
    'cornhole','pickem','squares','auction','other'));

-- 2) Ownership: one row per team a participant owns (bid in cents; 0 = bonus/free).
DROP TABLE IF EXISTS public.v2_auction_teams CASCADE;
CREATE TABLE public.v2_auction_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  entity_id     UUID NOT NULL REFERENCES public.v2_tournament_teams(id) ON DELETE CASCADE,
  bid_cents     INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by   UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  UNIQUE (contest_id, entity_id)  -- each entity owned by exactly one participant
);
CREATE INDEX idx_v2_auction_teams_contest ON public.v2_auction_teams(contest_id);
CREATE INDEX idx_v2_auction_teams_user ON public.v2_auction_teams(user_id);

ALTER TABLE public.v2_auction_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_auction_teams_all" ON public.v2_auction_teams FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_auction_teams TO authenticated, service_role;

-- Realtime: the live draft board subscribes to assignments.
ALTER TABLE public.v2_auction_teams REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_auction_teams;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
