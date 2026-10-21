-- Per-game payout tracking for Boxes (#230). The original payout table was one
-- row per (pool, member): a single paid amount for a member's whole-pool take.
-- That only supports settling the entire season at once. Admins also want to pay
-- out game-by-game (each week of an MNF slate, each round of a tournament), so the
-- paid record now carries a game_id and the key becomes (pool, member, GAME).
--
-- A member's pool-wide balance is the SUM across their per-game rows, so both
-- workflows coexist: settle one game now, or settle every unpaid game at once
-- (the master-payouts "pay it all" writes one row per game in a single shot).
--
-- Recreated (not altered): the old aggregate rows can't be split across games, and
-- these are pre-launch test marks only — nothing real is paid yet in v2.
DROP TABLE IF EXISTS public.v2_boxes_payouts CASCADE;
CREATE TABLE public.v2_boxes_payouts (
  contest_id UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  game_id    UUID NOT NULL REFERENCES public.v2_boxes_games(id) ON DELETE CASCADE,
  paid_cents INT NOT NULL DEFAULT 0,
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_by    UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  note       TEXT,
  PRIMARY KEY (contest_id, user_id, game_id)
);
-- Fast per-pool roll-up (master payouts sums every member's game rows).
CREATE INDEX v2_boxes_payouts_contest_idx ON public.v2_boxes_payouts (contest_id);

ALTER TABLE public.v2_boxes_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_boxes_payouts_all" ON public.v2_boxes_payouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_boxes_payouts TO authenticated, service_role;
