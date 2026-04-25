-- ===========================================
-- Loozer sponsorship: every Loozer is either a founding father
-- or was brought in by another Loozer (their sponsor).
-- ===========================================

ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "is_founder" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."users"
  ADD COLUMN IF NOT EXISTS "sponsor_id" uuid REFERENCES "public"."users"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "idx_users_sponsor_id"
  ON "public"."users" ("sponsor_id")
  WHERE "sponsor_id" IS NOT NULL;
