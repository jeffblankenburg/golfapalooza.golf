-- 00261_v2_pickem.sql
-- Pick'em (#209 contests) — "Whitey's Pick'em": a slate of college-football games picked
-- against the spread, with one game flagged as the total-points tiebreaker. Ports v1's
-- pickem_games + pickem_picks onto the v2 contest spine. The Pick'em contest itself is a
-- v2_contests row (contest_type='pickem'); open/closed uses v2_contests.status
-- ('draft' = hidden from members, 'active' = open). Entry fee / payouts (buy_in_cost_item_id
-- + payout_splits + paid tracking) come in a later slice.

DROP TABLE IF EXISTS public.v2_pickem_picks CASCADE;
DROP TABLE IF EXISTS public.v2_pickem_games CASCADE;

CREATE TABLE public.v2_pickem_games (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  away_team     TEXT NOT NULL,
  home_team     TEXT NOT NULL,
  away_logo_url TEXT,
  home_logo_url TEXT,
  away_color    TEXT,
  home_color    TEXT,
  spread        NUMERIC,                                  -- points the favorite is favored by
  favorite      TEXT CHECK (favorite IN ('away', 'home')),
  game_time     TIMESTAMPTZ,                              -- kickoff; the slate locks at the earliest
  tv_channel    TEXT,
  is_tiebreaker BOOLEAN NOT NULL DEFAULT false,           -- one per contest: guess total points
  winning_team  TEXT CHECK (winning_team IN ('away', 'home')),
  away_score    INTEGER,
  home_score    INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_pickem_games_contest ON public.v2_pickem_games(contest_id);

CREATE TABLE public.v2_pickem_picks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID NOT NULL REFERENCES public.v2_pickem_games(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  picked_team      TEXT CHECK (picked_team IN ('away', 'home')),
  tiebreaker_total INTEGER,                                -- only on the tiebreaker game
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_id, user_id)
);
CREATE INDEX idx_v2_pickem_picks_game ON public.v2_pickem_picks(game_id);
CREATE INDEX idx_v2_pickem_picks_user ON public.v2_pickem_picks(user_id);

-- Permissive RLS, API-gated writes (mirrors the rest of v2).
ALTER TABLE public.v2_pickem_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_pickem_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_pickem_games_all" ON public.v2_pickem_games FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_pickem_picks_all" ON public.v2_pickem_picks FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_pickem_games TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_pickem_picks TO authenticated, service_role;
