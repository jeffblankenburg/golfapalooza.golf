-- Issue #142 (poll attribution) + a poll results-visibility option.
--
-- 1. on_behalf_of_user_id — admin-only attribution: the Loozer a poll was
--    created *for* / on behalf of. Distinct from `created_by` (the admin who
--    physically authored it) and from the audience (who receives it). Nullable;
--    ON DELETE SET NULL so removing a user doesn't delete their polls.
--
-- 2. show_results_before_vote — refines `show_results_while_open`. When BOTH
--    are true, eligible users see live aggregate results even before they've
--    voted. When `show_results_while_open` is false this has no effect.
--    Defaults to false to preserve existing behavior.
--
-- polls already has table-level grants (migration 00114); adding columns needs
-- no new grant.

ALTER TABLE "public"."polls"
  ADD COLUMN IF NOT EXISTS "on_behalf_of_user_id" uuid
    REFERENCES "public"."users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "show_results_before_vote" boolean NOT NULL DEFAULT false;
