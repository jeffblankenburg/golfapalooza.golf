-- ===========================================
-- AI-assisted course import (Issues #109, #110)
--
-- Adds the columns and audit table needed for the
-- DB → GolfCourseAPI → AI → manual lookup cascade in
-- /api/courses/lookup, plus a shared ai_generations log
-- for all current and future AI-assisted features.
-- ===========================================

-- Course provenance & verification
ALTER TABLE "public"."courses"
  ADD COLUMN IF NOT EXISTS "lookup_key" text;

ALTER TABLE "public"."courses"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';

ALTER TABLE "public"."courses"
  DROP CONSTRAINT IF EXISTS "courses_source_check";
ALTER TABLE "public"."courses"
  ADD CONSTRAINT "courses_source_check"
  CHECK ("source" IN ('manual', 'gcapi', 'ai'));

ALTER TABLE "public"."courses"
  ADD COLUMN IF NOT EXISTS "verified" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."courses"
  ADD COLUMN IF NOT EXISTS "verified_by" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL;

ALTER TABLE "public"."courses"
  ADD COLUMN IF NOT EXISTS "verified_at" timestamptz;

-- Existing manually-entered courses are grandfathered in as verified
-- so the new "community-submitted" badge only appears on AI/GCAPI rows.
UPDATE "public"."courses"
SET "verified" = true
WHERE "verified" = false AND "source" = 'manual';

-- Cascade dedup: normalized name|state|city. Two users searching for the
-- same course should converge on the same row instead of creating dupes.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_courses_lookup_key"
  ON "public"."courses" ("lookup_key")
  WHERE "lookup_key" IS NOT NULL;

-- Per-tee confidence metadata for AI extractions (e.g., {"slope": "high"}).
ALTER TABLE "public"."course_tees"
  ADD COLUMN IF NOT EXISTS "confidence" jsonb;

-- ===========================================
-- ai_generations: audit log shared by all AI features
-- ===========================================
CREATE TABLE IF NOT EXISTS "public"."ai_generations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "public"."users"("id") ON DELETE SET NULL,
  "task" text NOT NULL,                     -- e.g. 'scorecard_lookup'
  "model" text NOT NULL,                    -- e.g. 'perplexity/sonar-pro'
  "input_hash" text NOT NULL,               -- sha256 of normalized input, for caching/dedup
  "input" jsonb NOT NULL,
  "output" jsonb,
  "confidence" text,                        -- 'high' | 'medium' | 'low' | null
  "cost_usd" numeric(10, 6),
  "latency_ms" integer,
  "committed" boolean NOT NULL DEFAULT false,
  "committed_resource_id" uuid,             -- e.g. courses.id once accepted
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ai_gen_user_recent"
  ON "public"."ai_generations" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_ai_gen_task_recent"
  ON "public"."ai_generations" ("task", "created_at" DESC);

-- All access goes through server-side service role; no direct client reads.
ALTER TABLE "public"."ai_generations" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_generations_no_client_access" ON "public"."ai_generations";
CREATE POLICY "ai_generations_no_client_access"
  ON "public"."ai_generations"
  FOR ALL
  USING (false)
  WITH CHECK (false);
