-- v2 activity/contest spine (#209, Phase 2a of #208). Ports v1's contests-as-spine
-- model into the org/event-scoped v2 world so an `kind='activity'` schedule item
-- becomes a real, configurable contest (first target: scramble + its side games).
--
-- Model (see #209):
--   * v2_contests is the spine. A multi-day scramble = ONE contest PER DAY, each
--     linked to that day's schedule item via v2_schedule_items.activity_id.
--   * Side games (skins, CTP, long drive/putt) are children via parent_contest_id.
--   * Event-spanning aggregate contests (BSPITW, 100 Feet!) are event-level
--     (parent_contest_id NULL); their scorer reads across all the event's scrambles.
--   * v2_contest_observations is one generalized per-player store (on_green,
--     holed_out, distance_in) that BSPITW / 100 Feet! / CTP all read from.
--   * v2_contest_winners is the single source of truth for who won + paid.
--
-- RLS: permissive at the DB layer; writes are gated to org admins in the API
-- (mirrors v2_schedule_items / v2_round_games). Grants per the Data API rule.
-- Naive-local times like the rest of the schedule; app manages updated_at.

-- Drop child-first for rollback safety.
DROP TABLE IF EXISTS public.v2_contest_observations CASCADE;
DROP TABLE IF EXISTS public.v2_contest_winners CASCADE;
DROP TABLE IF EXISTS public.v2_scramble_hole_scores CASCADE;
DROP TABLE IF EXISTS public.v2_scramble_team_members CASCADE;
DROP TABLE IF EXISTS public.v2_scramble_teams CASCADE;
DROP TABLE IF EXISTS public.v2_contest_participants CASCADE;
DROP TABLE IF EXISTS public.v2_contests CASCADE;

-- ── The spine ────────────────────────────────────────────────────────────────
CREATE TABLE public.v2_contests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id           UUID NOT NULL REFERENCES public.v2_events(id)        ON DELETE CASCADE,
  -- Side game → its scramble; NULL = a top-level or event-spanning contest.
  parent_contest_id  UUID REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  contest_type       TEXT NOT NULL CHECK (contest_type IN (
                       'scramble','skins','ctp','long_drive','long_putt',
                       'bspitw','hundred_feet','ryder_cup','calcutta',
                       'cornhole','pickem','other')),
  name               TEXT NOT NULL,
  -- 'derived' reads the scorecard/observations; 'manual' is human-adjudicated.
  scoring_source     TEXT NOT NULL DEFAULT 'manual' CHECK (scoring_source IN ('derived','manual')),
  -- Hole scope; NULL = all 18, {1..9} = front, {12} = a single hole.
  holes              SMALLINT[],
  -- Denormalized from the linked schedule item, for per-day grouping in
  -- aggregate leaderboards (BSPITW/100 Feet! day columns).
  contest_date       DATE,
  -- Per-type config: {team_size, handicap_allowance, skins_carryover, ...}.
  config             JSONB,
  -- Simple buy-in for now; full cost_items integration is a later phase.
  entry_amount_cents INTEGER,
  payout_splits      JSONB,
  -- Everyone on-roster is mirrored in (scramble/ryder/calcutta); skins is opt-in.
  auto_enroll        BOOLEAN NOT NULL DEFAULT false,
  -- CTP/LD "explicitly nobody won" vs "not yet decided".
  declared_no_winner BOOLEAN NOT NULL DEFAULT false,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','final')),
  winners_locked_at  TIMESTAMPTZ,
  winners_locked_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  created_by         UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One-step cycle guard; deeper cycles are prevented in the app.
  CONSTRAINT v2_contests_parent_not_self CHECK (parent_contest_id IS NULL OR parent_contest_id <> id)
);
CREATE INDEX idx_v2_contests_event  ON public.v2_contests(event_id);
CREATE INDEX idx_v2_contests_org    ON public.v2_contests(org_id);
CREATE INDEX idx_v2_contests_parent ON public.v2_contests(parent_contest_id) WHERE parent_contest_id IS NOT NULL;

-- ── Participation (per contest, seeded from the on-roster set, editable) ──────
CREATE TABLE public.v2_contest_participants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contest_id, user_id)
);
CREATE INDEX idx_v2_contest_participants_user ON public.v2_contest_participants(user_id);

-- ── Scramble format: teams, members, per-hole team scores ────────────────────
CREATE TABLE public.v2_scramble_teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  name          TEXT,
  team_handicap NUMERIC,
  course_par    INTEGER NOT NULL DEFAULT 72,
  tee_time      TIME,      -- projected onto the merged schedule (phase 2c)
  starting_hole SMALLINT,  -- shotgun support
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_scramble_teams_contest ON public.v2_scramble_teams(contest_id);

CREATE TABLE public.v2_scramble_team_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES public.v2_scramble_teams(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id)       ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);
CREATE INDEX idx_v2_scramble_team_members_team ON public.v2_scramble_team_members(team_id);
CREATE INDEX idx_v2_scramble_team_members_user ON public.v2_scramble_team_members(user_id);

CREATE TABLE public.v2_scramble_hole_scores (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES public.v2_scramble_teams(id) ON DELETE CASCADE,
  hole_number SMALLINT NOT NULL CHECK (hole_number >= 1 AND hole_number <= 18),
  strokes     SMALLINT NOT NULL CHECK (strokes >= 1 AND strokes <= 20),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, hole_number)
);
CREATE INDEX idx_v2_scramble_hole_scores_team ON public.v2_scramble_hole_scores(team_id);

-- ── Winners: the single source of truth for who won + paid ───────────────────
CREATE TABLE public.v2_contest_winners (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id   UUID NOT NULL REFERENCES public.v2_contests(id)       ON DELETE CASCADE,
  user_id      UUID REFERENCES public.v2_profiles(id)                ON DELETE CASCADE,  -- individual contests
  team_id      UUID REFERENCES public.v2_scramble_teams(id)          ON DELETE CASCADE,  -- team contests
  hole_number  SMALLINT,   -- per-hole wins (skins, CTP)
  place        SMALLINT NOT NULL DEFAULT 1,
  amount_cents INTEGER,
  paid         BOOLEAN NOT NULL DEFAULT false,
  paid_at      TIMESTAMPTZ,
  notes        TEXT,
  resolved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by  UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  CONSTRAINT v2_contest_winners_who CHECK (user_id IS NOT NULL OR team_id IS NOT NULL)
);
CREATE INDEX idx_v2_contest_winners_contest ON public.v2_contest_winners(contest_id);
CREATE INDEX idx_v2_contest_winners_user    ON public.v2_contest_winners(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_v2_contest_winners_team    ON public.v2_contest_winners(team_id) WHERE team_id IS NOT NULL;

-- ── Generalized per-player observations (BSPITW bonuses, CTP/100 Feet! dist) ──
CREATE TABLE public.v2_contest_observations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES public.v2_events(id)   ON DELETE CASCADE,
  -- The scramble DAY contest the observation was recorded in; aggregate contests
  -- read across all of an event's scrambles.
  contest_id  UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  hole_number SMALLINT CHECK (hole_number IS NULL OR (hole_number >= 1 AND hole_number <= 18)),
  metric      TEXT NOT NULL CHECK (metric IN ('on_green','holed_out','distance_in')),
  value       INTEGER NOT NULL,  -- bool as 0/1; distance in inches
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contest_id, user_id, hole_number, metric)
);
CREATE INDEX idx_v2_contest_observations_contest ON public.v2_contest_observations(contest_id);
CREATE INDEX idx_v2_contest_observations_event   ON public.v2_contest_observations(event_id);
CREATE INDEX idx_v2_contest_observations_user    ON public.v2_contest_observations(user_id);

-- ── RLS: permissive at the DB; writes gated to org admins in the API ──────────
ALTER TABLE public.v2_contests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_contest_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_scramble_teams        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_scramble_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_scramble_hole_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_contest_winners       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_contest_observations  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "v2_contests_all"              ON public.v2_contests              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_contest_participants_all"  ON public.v2_contest_participants  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_scramble_teams_all"        ON public.v2_scramble_teams        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_scramble_team_members_all" ON public.v2_scramble_team_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_scramble_hole_scores_all"  ON public.v2_scramble_hole_scores  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_contest_winners_all"       ON public.v2_contest_winners       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_contest_observations_all"  ON public.v2_contest_observations  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Data API grants (required for PostgREST/supabase-js reachability) ─────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_contests              TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_contest_participants  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_scramble_teams        TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_scramble_team_members TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_scramble_hole_scores  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_contest_winners       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_contest_observations  TO authenticated, service_role;
