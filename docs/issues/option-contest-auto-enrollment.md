## Problem

Opting into an event option doesn't currently put the Loozer into the matching contest. Two distinct gaps:

1. **Per-option contests** (singles cornhole, doubles cornhole, etc.) — the linkage helper exists at `src/lib/option-contest-sync.ts::syncContestEnrollment` but only fires when the option row has a `linked_contest_id`. On the current active trip, the relevant cornhole options aren't pointing at the right contests, so checking the box doesn't add a participant. Result: admin has to hand-add every Loozer to the bracket after they opt in.
2. **Trip-attendance contests** (Calcutta, Scrambles, KGB Cup) — there is no auto-enrollment path. If a Loozer's `event_participants.on_roster=true` for the active trip, they should automatically appear in these contests' `contest_participants` rosters. Today they don't.

Both should be true:

> Opt into an option → enrolled in its contest.
> Show up to the event at all → enrolled in Calcutta / Scrambles / KGB Cup automatically.

## Why it matters

Admin labor + missed-roster bugs. We've already had a tee box loss and an "I thought I was signed up" complaint this cycle. The system should not depend on the admin remembering to mirror every opt-in into the contest table.

## What's already wired

- `option-contest-sync.ts::syncContestEnrollment` handles checkbox + select options with `linked_contest_id`. Called from `POST /api/selections` (line 239). Removes participants on opt-out.
- `syncCostItemContestEnrollment` is the cost-item-aware variant for the post-#125 flow.
- `event_participants(user_id, trip_id, on_roster)` is the unified attendance source (per migration `00133`).

## What needs to happen

### Phase 1: Audit + repair existing option ↔ contest links
- Write a one-off script (`scripts/audit-option-contest-links.mjs`) that walks every paid option on the active + test trips and reports which ones lack a `linked_contest_id` or have a stale one.
- For each unlinked option that *should* enroll into a contest (singles cornhole, doubles cornhole, Skins, etc.), patch the link (one-shot UPDATE) and run `syncContestEnrollment` for everyone already opted in so the rosters catch up.

### Phase 2: Attendance → blanket-enrollment contests
- Add a flag on `contests` — `auto_enroll_attendees BOOLEAN DEFAULT FALSE` (migration). Set true for Calcutta, the per-day Scramble, and KGB Cup contests on existing + future trips.
- Mirror the option-sync helper in `src/lib/attendance-contest-sync.ts`:
  - On `event_participants` insert/update where `on_roster` flips to true → upsert `contest_participants` for every `auto_enroll_attendees=true` contest on that trip.
  - On `on_roster` flip to false → remove the participant, but guard against destroying scoring/bidding state (refuse + log when a Calcutta bid or scramble team membership exists).
- Hook the sync into the two places attendance changes: the home-page RSVP path and `PUT /api/admin/attendance/cell`.

### Phase 3: Reverse sweep
- On contest create (e.g., admin sets up the Scramble on day 2), backfill the participants from current attendance.
- Admin gesture on the contest setup page: "Sync from attendance now" button as a manual escape hatch.

## Edge cases

- **Pickem entry fees** — `upsertParticipantWithPickemPayment` already handles the payment row. Whatever attendance-sync does for Calcutta must not accidentally create a payment row for non-Pickem contests.
- **Manual de-enrollment** — if an admin or a Loozer explicitly removes themselves from Calcutta but stays on the trip roster, the next attendance sync shouldn't re-add them. Track an explicit `manually_removed` marker on `contest_participants` (timestamp + reason), and treat its presence as "don't auto-add."
- **Historical trips** — only run sync against `trip_settings.status IN ('active','test')`. Archived trips (1997–2024 history import) stay frozen.
- **Cornhole bracket already generated** — adding a participant after the bracket exists is currently disallowed (per `CornholeBracketManager`). Either widen that gate, or surface "added after bracket — manual seed needed" warnings to the admin.
- **Simulator** — `getEffectiveUserId` / `getEffectiveTripId` must be honored in every sync entrypoint.

## Acceptance criteria

1. Checking "Singles Cornhole" on the home options form immediately makes the Loozer appear on the Singles bracket participants list (without admin action).
2. Unchecking it removes them (with the bracket-locked guard from edge cases above).
3. Setting `event_participants.on_roster=true` for a trip enrolls the Loozer in Calcutta + Scrambles + KGB Cup contests within one HTTP round trip.
4. Setting `on_roster=false` removes them where safe, refuses + warns where not safe.
5. Audit script reports zero unlinked paid-option rows on the active trip after Phase 1 lands.
6. Admin "Sync from attendance" button exists on the Calcutta + Scramble + KGB Cup setup pages.
7. No regressions in payouts / Skins / Pickem entry-fee flows.

## Reference files

- `src/lib/option-contest-sync.ts` — existing helper, mirror its shape for attendance.
- `src/app/api/selections/route.ts` — call site for option sync.
- `src/app/api/admin/attendance/cell/route.ts` — call site to add for attendance sync.
- `src/app/api/calcutta/*` and `src/app/api/admin/calcutta/*` — current Calcutta participant management.
- Migration `00133_unify_attendance.sql` — attendance source of truth.
