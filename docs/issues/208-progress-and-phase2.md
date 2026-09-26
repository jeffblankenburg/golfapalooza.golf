## Progress update — Phase 1 shipped, and grew into a merged group calendar

Phase 1 landed, but the scope expanded past a single event's agenda into **one merged, read-time calendar** for the whole group.

### Migrations
- `00243_v2_schedule_items.sql` — the table.
- `00244_v2_schedule_items_end_day.sql` — optional `end_day` for multi-day items.
- `00245_v2_schedule_group_scope.sql` — `event_id` made **nullable** (group-level items), `(org_id, day)` index, and `v2_organizations.show_birthdays` (per-org opt-out, default true).

### The merged feed
`src/lib/v2/schedule-feed.ts::buildMemberSchedule` composes a single sorted `CalendarEntry[]` (type in `src/lib/v2/schedule.ts`) from:
- **Group items** — `event_id NULL` (club dates, dues, logistics). Authored.
- **Event items** — items of `status='active'` events. Authored.
- **Activity items** — items carrying `activity_id` (Phase 2). Authored/projected.
- **Event spans** — derived from `v2_events.start/end_date`; never stored.
- **Birthdays** — derived from `v2_profiles.birthdate`; never typed; opt-out per org; **excluded from the public iCal** for privacy.

Scope decisions (confirmed): group items + birthdays always; event/activity items for **active events only**; birthdays **on by default**. Feed windowed (~30d back, forward open; birthdays project ~400d) to stay under the 1000-row cap.

### Member view — `/new/[slug]/schedule`
- Apple-Calendar **List view** (no date tabs), opens scrolled to the next upcoming day, past days scrollable above.
- **Static header** (breadcrumb + "Schedule" + a single "add to calendar" icon) — stays put; list scrolls beneath.
- **Multi-day events repeat as an all-day banner atop each day** (Apple-style), brand-tinted; the composer keeps one canonical span so the iCal stays a single multi-day VEVENT.
- Notes preserve line breaks; location vs notes have distinct visual weight; `EventLocation` only links/pins when the string looks like a real address.

### Admin authoring
- **Event schedule** — `/new/[slug]/admin/events/[eventId]/schedule` (shows the event as an all-day banner atop each of its days).
- **Group schedule** — `/new/[slug]/admin/schedule` (new "Schedule" card on the admin hub) for non-event dates.
- One `ScheduleEditor` serves both via a configurable `apiBase`; Type is now compact pills.

### APIs
- Event: `GET/POST /api/v2/orgs/[id]/events/[eventId]/schedule`, `PATCH/DELETE .../[itemId]`.
- Group: `GET/POST /api/v2/orgs/[id]/schedule`, `PATCH/DELETE .../[itemId]` (scoped to `event_id IS NULL`).
- iCal: `GET /api/v2/ical/[eventId]` (event) and `GET /api/v2/ical/org/[orgId]` (merged, birthdays excluded). Public/unauthenticated so `webcal://` subscriptions work; auto-updates on the calendar app's own poll cadence.

### v1 → v2 parity gaps still open (depend on Phase 2 modules)
- Tee-times woven into the day view.
- Named event days.
- Pre-event grouping.

---

## Phase 2 — pluggable activity modules

**The design (confirmed):** an `kind='activity'` schedule item is the **front door** to an interactive module. `activity_type` is the label picked today; `activity_id` links to the module's record once it exists (null = placeholder). Each module owns its config, rosters, schedule, and scoring, and **projects its time-sensitive items (tee times, auction start, bracket times) back into the merged feed** as `source:"activity"` entries that deep-link into the module. The composer already has a stubbed provider slot for exactly this.

### Scramble module (first to build)
Selecting "Scramble" on a schedule item will create/attach a scramble activity (`activity_id`) that holds:
- **Rules** — team size (2-man / 4-man / …), handicap allowance, optional skins side-pot, etc.
- **Rosters / teams** — assign members to teams.
- **Tee times** — per-group start times → projected into the schedule as one entry per tee time.
- **Scoring** — reuse the v2 scoring pipeline where possible.

Port v1's proven model (`scramble_teams` / `scramble_hole_scores`, tee times) rather than inventing a new one. In v1 these FK to `contests`; the v2 equivalent links to the schedule item via `activity_id`.

### Other modules (each its own sub-issue, same attach-via-`activity_id` pattern)
- **Calcutta** auction.
- **Cornhole** bracket.
- **Ryder Cup** (team match play).
- **Skins / Pick'em**.

### Cross-cutting Phase 2 work
- Implement the composer's activity-provider hook (module → feed tee-time entries).
- Fold in the v1 parity gaps above (tee-times in day view, named days, pre-event grouping) as modules land.
- Decide whether each module gets its own GH issue linked back here.
