-- 00259_v2_team_needs_attention.sql
-- Attendance-change integrity (#217). When a member drops below "Attending" (or
-- clears their RSVP), they're cascaded off auto-enroll contests + their opted-in
-- options, and removed from any scramble team seat they held. That leaves an empty
-- seat a human must fix, so we flag the affected team: `needs_attention_at` is set
-- on the leave cascade and surfaced as a badge on the contests list + Teams page.
-- It clears naturally — the Teams PUT replaces (delete+recreate) all teams for a
-- contest, so re-saving the roster drops the flag.

ALTER TABLE public.v2_scramble_teams
  ADD COLUMN IF NOT EXISTS needs_attention_at TIMESTAMPTZ;
