-- Merged member calendar (#208). Turns the event-only schedule into a layered one:
-- a member's "Schedule" is ONE seamless feed composed at read time from
--   * group-level items      (org_id set, event_id NULL)  — birthdays, logistics, club dates
--   * event-level items      (org_id + event_id set)      — the existing per-event agenda
--   * activity items         (event_id + activity_id set) — tee times etc. (modules, later)
--   * derived event spans    (from v2_events.start/end_date)
--   * derived birthdays      (from v2_profiles.birthdate)  — never typed
--
-- This migration is the only schema change the layered model needs:
--   1. event_id becomes NULLABLE so a schedule item can live at the GROUP level.
--   2. an (org_id, day) index for the merged group query.
--   3. v2_organizations.show_birthdays — per-org opt-out for the derived birthday feed.

-- 1. Group-level items have no event.
ALTER TABLE public.v2_schedule_items ALTER COLUMN event_id DROP NOT NULL;

-- 2. The merged read walks the org's items by day (group items + active-event items).
CREATE INDEX IF NOT EXISTS idx_v2_schedule_items_org_day ON public.v2_schedule_items(org_id, day);

-- 3. Birthdays are on by default; a group admin can hide them.
ALTER TABLE public.v2_organizations ADD COLUMN IF NOT EXISTS show_birthdays BOOLEAN NOT NULL DEFAULT true;
