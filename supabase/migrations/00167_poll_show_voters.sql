-- Poll voter attribution visible to everyone (not just admins).
--
-- show_voters — when true AND the poll is NOT anonymous, the results shown to
-- voters include who voted for each option (names + avatars), both while the
-- poll is open (subject to show_results_while_open / show_results_before_vote)
-- and after it closes. Enables "who picked which tee time?" style polls.
--
-- Mutually exclusive with is_anonymous (anonymous always wins). Defaults to
-- false to preserve existing behavior, where only admins see attribution.
--
-- polls already has table-level grants (migration 00114); adding a column needs
-- no new grant.

ALTER TABLE "public"."polls"
  ADD COLUMN IF NOT EXISTS "show_voters" boolean NOT NULL DEFAULT false;
