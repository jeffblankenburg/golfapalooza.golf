# v2: attendance ↔ contest enrollment sync + import attendees (Lane A)

Part of #214. Ports v1's blanket auto-enroll so "Attending" actually populates the contests a member is in, and gives admins a way to pull current attendees into a contest added *after* people RSVP'd.

Today in v2: `v2_contest_participants` is a bare join table, the participants API is read-only, RSVP (`/api/v2/events/[eventId]/rsvp`) explicitly notes "enrollment sync lands when v2 contests do," and there is no auto-enroll. So a contest shows **0 players** even when 41 members are attending — exactly the confusion that kicked this off.

## Scope

**Lane A only — "Included" (auto-enroll) contests.** Whether a contest is Included vs Optional is a **per-contest admin choice, not fixed by type** (a Ryder Cup can be Included in one event, Optional in another). This issue covers only contests the admin set to Included; Optional contests (opt-in, free or paid) route through the Options layer in #216. No money here — Included contests fold into Trip Cost.

## Principle: participation is independent of attendance (load-bearing)

`v2_contest_participants` is the **authoritative** list of who's in a contest. Attendance (`on_roster`) only **seeds** it via auto-enroll — it never constrains it. Admins can **add anyone and remove anyone, regardless of attendance status**, and the system must never block that ("we can't be too sticky"). Real cases that must all work:

- **Attending, but not in a contest** — a member registered for the whole event leaves Friday early; pull them from Friday's cornhole + Saturday's contests while they stay `on_roster`.
- **In a contest, but not attending** — a local drives in to play only the Saturday round; add them to that one contest though they're not on the roster and never paid Trip Cost.
- So: the participants write API accepts **any org member** (not just `on_roster` ones) and allows **removing `on_roster` members** from any contest.
- Billing follows separately via the ledger (#216): the drop-in gets a one-off charge, the early-leaver can be credited — divergences from the roster are reconciled with manual ledger entries, not by forcing participation to match attendance.

## Model

- **No new flag.** A contest is "Included" iff its buy-in cost_item has **`included_in_trip_cost = true`** (#213's reconciliation bucket). That IS the lane selector — set by the admin reconciling the contest to Trip Cost vs an Option on the existing Financials screen, per event. Contest *type* doesn't decide it. (A free Included contest is a $0 cost_item marked `included_in_trip_cost`.)
- A helper `isIncludedContest(contestId)` resolves this (contest → buy-in cost_item → `included_in_trip_cost`).
- **`v2_contest_enrollment_exclusions`** (new table, mirrors v1) — tombstone of "this member was explicitly removed from this Included contest; don't auto-re-add." `(contest_id, user_id)` unique, `removed_by`, `reason`, `removed_at`. Mainly for the admin manually pulling one person from an Included contest (Included normally means everyone attending is in).
- Enrollment stays `v2_contest_participants (contest_id, user_id)`.

## Behavior

1. **On attend** (`on_roster` → true, from RSVP 99 or admin toggle): additively upsert the member into every **Included** contest (`included_in_trip_cost=true`) in the event, **except** contests they have an exclusion tombstone for. Idempotent.
2. **On contest becoming Included** — created already in Trip Cost, or reconciled *into* Trip Cost later: enroll everyone currently `on_roster` (minus tombstones). This is the "admin adds a contest after people enrolled" case. (Reconciling a contest *out* of Trip Cost to an Option is a lane change toward opt-in — enrollment transition handled with #216/#217, not here.)
3. **Manual import UI** on the contest page: "Import attendees" → **add all** on-roster members, or pick a **subset**. Omitting someone on a subset import, or removing an enrolled member, writes an exclusion tombstone so the next attend-sync doesn't silently re-add them.
4. **Manual add/remove** of individual participants (admin), writing tombstones on removal.

(Removal driven by an *attendance drop* — and its team/tee-time guards + admin alerts — is sub-issue 3. This issue is the additive + manual-admin side.)

## API

- `POST /api/v2/orgs/[id]/events/[eventId]/contests/[contestId]/participants` — add one/many (body `{ userIds: [] }` or `{ importAll: true }`); clears tombstones for added users.
- `DELETE …/participants` — remove one/many; writes exclusion tombstones (`removed_by`, optional `reason`).
- Extend the existing contest-create path to run auto-enroll when the flag is set.
- Shared helper `syncAttendanceEnrollment(admin, eventId, userId, onRoster)` in `src/lib/v2/contests/` — called from the RSVP route and admin attendance writes (additive path now; guarded-removal path lands in #3).

## UX

- Contest page "Teams/Players" area: a players list + **Import attendees** button → modal (select all / search + check subset). For Included contests, show a one-line note ("Part of Trip Cost — everyone attending is automatically in") reflecting its reconciliation state; the lane is changed on the Financials screen, not a separate per-contest toggle.
- Reuse existing member-row + modal patterns; v2 design system.

## Edge cases
- Re-running import is idempotent (upsert).
- A member with a tombstone is skipped by import-all and by attend-sync until re-added explicitly (which clears the tombstone).
- Guests / non-members: not applicable (contest participants are profiles).
- Respect the 1000-row cap on any attendee/member fetch.

## Acceptance criteria
- Marking a member Attending enrolls them into all Included (`included_in_trip_cost`) contests (minus tombstones).
- A contest created in / reconciled into Trip Cost enrolls current attendees.
- "Import attendees" adds all or a chosen subset; the contest player count reflects it immediately.
- An admin can add a member who is **not** `on_roster` to a contest (local drop-in), and remove an `on_roster` member from a contest (left early) — neither is blocked.
- Removing a participant prevents auto-re-add (tombstone) until explicitly re-added.
- No money side effects (that's #2).

## v1 reference
`src/lib/attendance-contest-sync.ts`, migration `00165_attendance_contest_autoenroll.sql`, `src/app/api/admin/contests/route.ts` (AUTO_ENROLL_TYPES).
