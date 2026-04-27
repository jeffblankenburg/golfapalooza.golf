-- ===========================================
-- Polls (Issue #117)
--
-- Admin-authored polls for Loozers with the same audience model as
-- announcements. One active poll at a time, surfaced as a home-page CTA
-- that opens a modal drawer. Polls can be scheduled, optionally anonymous,
-- and may auto-send a launch notification. Voters can change their vote
-- until close. Admins can reopen closed polls.
-- ===========================================

-- ===========================================
-- polls: top-level container
-- ===========================================
CREATE TABLE IF NOT EXISTS "public"."polls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(300) NOT NULL,
  "description" text,
  "audience_type" text NOT NULL,
  "audience_user_ids" uuid[],
  "trip_id" uuid REFERENCES "public"."trip_settings"("id") ON DELETE SET NULL,
  "is_anonymous" boolean NOT NULL DEFAULT false,
  "send_notification_on_launch" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'draft',
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "created_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."polls"
  DROP CONSTRAINT IF EXISTS "polls_audience_type_check";
ALTER TABLE "public"."polls"
  ADD CONSTRAINT "polls_audience_type_check"
  CHECK ("audience_type" IN ('everyone', 'event', 'custom'));

ALTER TABLE "public"."polls"
  DROP CONSTRAINT IF EXISTS "polls_status_check";
ALTER TABLE "public"."polls"
  ADD CONSTRAINT "polls_status_check"
  CHECK ("status" IN ('draft', 'scheduled', 'active', 'closed'));

-- Drafts may have null timestamps. Once scheduled/active/closed, both must
-- be set and ends_at must be after starts_at.
ALTER TABLE "public"."polls"
  DROP CONSTRAINT IF EXISTS "polls_window_check";
ALTER TABLE "public"."polls"
  ADD CONSTRAINT "polls_window_check"
  CHECK (
    ("starts_at" IS NULL AND "ends_at" IS NULL)
    OR (
      "starts_at" IS NOT NULL
      AND "ends_at" IS NOT NULL
      AND "ends_at" > "starts_at"
    )
  );

-- DB-level safety net for the "one active poll at a time" rule. The
-- application layer additionally prevents scheduled-window overlap.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_polls_one_active"
  ON "public"."polls" ("status")
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "idx_polls_status_starts_at"
  ON "public"."polls" ("status", "starts_at");

CREATE INDEX IF NOT EXISTS "idx_polls_created_at"
  ON "public"."polls" ("created_at" DESC);

DROP TRIGGER IF EXISTS polls_updated_at ON "public"."polls";
CREATE TRIGGER polls_updated_at
  BEFORE UPDATE ON "public"."polls"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- poll_questions: a poll can have 1+ questions
-- ===========================================
CREATE TABLE IF NOT EXISTS "public"."poll_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "poll_id" uuid NOT NULL REFERENCES "public"."polls"("id") ON DELETE CASCADE,
  "question_text" text NOT NULL,
  "question_type" text NOT NULL,
  "max_selections" integer,
  "max_length" integer,
  "order_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."poll_questions"
  DROP CONSTRAINT IF EXISTS "poll_questions_type_check";
ALTER TABLE "public"."poll_questions"
  ADD CONSTRAINT "poll_questions_type_check"
  CHECK ("question_type" IN ('single', 'multi', 'text'));

CREATE INDEX IF NOT EXISTS "idx_poll_questions_poll"
  ON "public"."poll_questions" ("poll_id", "order_index");

-- ===========================================
-- poll_options: choices for select-type questions
-- ===========================================
CREATE TABLE IF NOT EXISTS "public"."poll_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" uuid NOT NULL REFERENCES "public"."poll_questions"("id") ON DELETE CASCADE,
  "option_text" text NOT NULL,
  "order_index" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_poll_options_question"
  ON "public"."poll_options" ("question_id", "order_index");

-- ===========================================
-- poll_responses: one row per (poll, user) — tracks who answered
-- ===========================================
CREATE TABLE IF NOT EXISTS "public"."poll_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "poll_id" uuid NOT NULL REFERENCES "public"."polls"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
  "submitted_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("poll_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "idx_poll_responses_user"
  ON "public"."poll_responses" ("user_id");

DROP TRIGGER IF EXISTS poll_responses_updated_at ON "public"."poll_responses";
CREATE TRIGGER poll_responses_updated_at
  BEFORE UPDATE ON "public"."poll_responses"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ===========================================
-- poll_answers: per-question answer rows. Multi-select uses N rows.
-- ===========================================
CREATE TABLE IF NOT EXISTS "public"."poll_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "response_id" uuid NOT NULL REFERENCES "public"."poll_responses"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "public"."poll_questions"("id") ON DELETE CASCADE,
  "option_id" uuid REFERENCES "public"."poll_options"("id") ON DELETE CASCADE,
  "text_answer" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "public"."poll_answers"
  DROP CONSTRAINT IF EXISTS "poll_answers_one_value_check";
ALTER TABLE "public"."poll_answers"
  ADD CONSTRAINT "poll_answers_one_value_check"
  CHECK (
    ("option_id" IS NOT NULL AND "text_answer" IS NULL)
    OR ("option_id" IS NULL AND "text_answer" IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS "idx_poll_answers_response"
  ON "public"."poll_answers" ("response_id");

CREATE INDEX IF NOT EXISTS "idx_poll_answers_question"
  ON "public"."poll_answers" ("question_id");

-- ===========================================
-- RLS
-- ===========================================
ALTER TABLE "public"."polls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."poll_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."poll_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."poll_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."poll_answers" ENABLE ROW LEVEL SECURITY;

-- All non-admin reads/writes go through service-role API routes that
-- enforce audience eligibility and status checks. Direct client access
-- is disabled to keep audience evaluation centralized.
DROP POLICY IF EXISTS "polls_no_client_access" ON "public"."polls";
CREATE POLICY "polls_no_client_access"
  ON "public"."polls" FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_questions_no_client_access" ON "public"."poll_questions";
CREATE POLICY "poll_questions_no_client_access"
  ON "public"."poll_questions" FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_options_no_client_access" ON "public"."poll_options";
CREATE POLICY "poll_options_no_client_access"
  ON "public"."poll_options" FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_responses_no_client_access" ON "public"."poll_responses";
CREATE POLICY "poll_responses_no_client_access"
  ON "public"."poll_responses" FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "poll_answers_no_client_access" ON "public"."poll_answers";
CREATE POLICY "poll_answers_no_client_access"
  ON "public"."poll_answers" FOR ALL USING (false) WITH CHECK (false);
