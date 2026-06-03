-- Add `show_results_while_open` toggle to polls. When true, voters who
-- have submitted a response see live aggregate results (percentages /
-- counts only — never attribution) inside the poll drawer while the
-- poll is still active. Non-voters never see results until close.
-- Defaults to false to preserve existing poll behavior.

ALTER TABLE "public"."polls"
  ADD COLUMN IF NOT EXISTS "show_results_while_open" boolean NOT NULL DEFAULT false;
