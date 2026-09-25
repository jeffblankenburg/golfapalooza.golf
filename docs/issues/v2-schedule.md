Part of #171 (Schedule & Logistics epic) / #174. The schedule is the spine of an event: a per-day agenda where an admin lays out everything that happens — golf matches, side competitions, meals, TV games, logistics. Some items are purely informational; some are the front door to an interactive module (Ryder Cup, scramble, calcutta, cornhole…).

## Model
One table, `v2_schedule_items` — mirrors v1 `itinerary_items` (00014) + two additions that make it the spine (`kind`, activity link):

- `id`, `event_id` (FK v2_events ON DELETE CASCADE), `org_id`
- `title`, `description`, `location` (tappable maps link, reuse EventLocation)
- `day` DATE, `start_time` TIME, `end_time` TIME, `all_day` BOOLEAN, `sort_order` INT
- `kind` TEXT CHECK IN ('activity','meal','watch','logistics','general')  — drives icon/affordance
- `activity_type` TEXT (nullable) — module kind: 'ryder_cup','scramble','scramble_skins','calcutta','cornhole','skins','pickem'… (aligns w/ v1 contest types)
- `activity_id` UUID (nullable) — loose ref to the module's record once that module exists; null = placeholder slot
- `created_by`, `created_at`, `updated_at`; grant SELECT/INSERT/UPDATE/DELETE to authenticated, service_role

An item is EITHER informational (meal/watch/logistics/general) or module-backed (kind='activity' + activity_type, optionally activity_id). Informational items need zero modules; activity items can start as titled placeholders and gain a real module later.

## UX (decided)
- **Per-day agenda/timeline** (mobile-first): day selector across the top, time-ordered vertical list per day. No week-grid (too cramped at 400px; maybe a desktop grid later).
- Admin editor at `/new/[slug]/admin/events/[eventId]/schedule` (wire the existing "Schedule" hub tile). Add/edit/delete items via a form (title, kind, day, start/end time, location, description, optional activity type).
- Member-facing read-only agenda (route `/new/[slug]/schedule`, or a home module) — TBD in phase 1.

## Phases
1. **Backbone (this issue):** migration + schedule API (admin-gated writes, member reads) + admin agenda editor + member read-only agenda. Informational items fully работают; activity items are placeholders.
2. **Modules attach incrementally** (separate issues): scramble scoring, calcutta auction, cornhole bracket, Ryder Cup, skins/pickem — each links back to its schedule slot via activity_id and becomes the item's front door.

## Notes
- Naive-local day/time (DATE + TIME) like v1 — avoids timezone conversion headaches; the agenda groups by `day`.
- Honors the time simulator for "today"/highlighting via v2Now().
- Spectator: schedule is public-safe (no personal data) if a public event view ever exists.
