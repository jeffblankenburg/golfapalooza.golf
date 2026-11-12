-- 00290_v2_props.sql
--
-- #243: the Props contest — admin-authored proposition questions for any event
-- ("How long is the national anthem?", "How many aircraft in the flyover?", "Coin toss?",
-- "Over/under 48.5 total points"). Members submit one answer per question before a single
-- lock time; the admin enters the correct answer for each question MANUALLY after the event
-- (no reliable data feed for novelty props). Points are scored, a leaderboard ranks everyone,
-- and money (optional) reuses the shared options/balances + payout_splits engine.
--
-- Generalized Pick'em with heterogeneous question types. Distinct from the slate substrate
-- (v2_matchups/v2_picks), which models sports matchups — props are multiple-choice / yes-no /
-- numeric / over-under, so they get their own author-and-settle tables.

-- 1) Open the contest_type CHECK to add 'props'.
ALTER TABLE public.v2_contests DROP CONSTRAINT IF EXISTS v2_contests_contest_type_check;
ALTER TABLE public.v2_contests ADD CONSTRAINT v2_contests_contest_type_check
  CHECK (contest_type IN (
    'scramble','skins','ctp','long_drive','long_putt',
    'bspitw','hundred_feet','ryder_cup','calcutta',
    'cornhole','pickem','squares','auction','props','other'));

-- 2) Questions: one row per prop the admin authors. The correct answer (answer_text /
--    answer_number) is NULL until the admin settles it. `voided` drops a question from
--    everyone's scoring (and the max-points total). Numeric scoring rule can be overridden
--    per question (else the contest's set default from config applies).
DROP TABLE IF EXISTS public.v2_prop_questions CASCADE;
CREATE TABLE public.v2_prop_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  prompt        TEXT NOT NULL,
  qtype         TEXT NOT NULL CHECK (qtype IN ('multiple_choice','yes_no','numeric','over_under')),
  choices       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{ id, label }] for multiple_choice / yes_no
  line          NUMERIC,                             -- the O/U line (over_under only)
  points        INTEGER NOT NULL DEFAULT 1,          -- weight toward the total
  numeric_rule  TEXT CHECK (numeric_rule IN ('absolute','no_over','exact')),  -- per-question override
  format        TEXT CHECK (format IN ('number','duration')),  -- numeric display hint (mm:ss)
  answer_text   TEXT,            -- settled correct choice id (MC/YN) or winning side ('over'/'under')
  answer_number NUMERIC,         -- settled correct number (numeric) or actual value (over_under)
  voided        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_v2_prop_questions_contest ON public.v2_prop_questions(contest_id);

-- 3) Answers: one row per member per question. `choice` XOR `number` by question type
--    (enforced in the API, since the type lives on the parent row).
DROP TABLE IF EXISTS public.v2_prop_answers CASCADE;
CREATE TABLE public.v2_prop_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.v2_prop_questions(id) ON DELETE CASCADE,
  contest_id  UUID NOT NULL REFERENCES public.v2_contests(id) ON DELETE CASCADE,  -- denormalized for per-contest reads
  user_id     UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  choice      TEXT,     -- selected choice id (MC/YN) or 'over'/'under' (O/U)
  number      NUMERIC,  -- numeric guess
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, user_id)
);
CREATE INDEX idx_v2_prop_answers_question ON public.v2_prop_answers(question_id);
CREATE INDEX idx_v2_prop_answers_contest ON public.v2_prop_answers(contest_id);
CREATE INDEX idx_v2_prop_answers_user ON public.v2_prop_answers(user_id);

-- Permissive RLS, API-gated writes (mirrors the rest of v2). Member-only — Props, like
-- Pick'em, is excluded from the public spectator page, so no `anon` grant.
ALTER TABLE public.v2_prop_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v2_prop_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "v2_prop_questions_all" ON public.v2_prop_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "v2_prop_answers_all" ON public.v2_prop_answers FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_prop_questions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_prop_answers TO authenticated, service_role;

-- Realtime: the live leaderboard subscribes to answers landing + results being entered.
-- FULL replica identity so DELETE events (a question removed, answers reset) carry the old row.
ALTER TABLE public.v2_prop_questions REPLICA IDENTITY FULL;
ALTER TABLE public.v2_prop_answers REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_prop_questions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_prop_answers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
