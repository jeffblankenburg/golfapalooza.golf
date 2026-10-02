# v2: enrollment, member balances & attendance integrity (epic)

The lifecycle that ties attendance, contests, and money together in v2. Today these are disconnected: marking a member "Attending" (`v2_event_participants`) does nothing to contest enrollment (`v2_contest_participants`), contest buy-ins live only as a catalog (`v2_cost_items`) with **no per-member balance**, and nothing reacts when an attending member bails. v1 solved all of this; v2 has ported none of it. This epic ports the model — and fixes the one place v1 fell short (it computed roster-break warnings and then threw them away).

Builds on **#213** (cost_items money spine + financials screen) and **#209** (contests-as-spine / side games). This is #213's phases 3–4 plus the per-member dimension #213 never built.

## The core mental model: two enrollment lanes

The lane a contest lives in is decided by the **existing `included_in_trip_cost` flag** on its buy-in cost_item (the #213 reconciliation bucket) — **not a new flag, and not fixed by contest type.** The admin sets it by reconciling the contest's cost_item to Trip Cost vs an Option, per event. (Example: a Ryder Cup is Included one event by putting its cost in Trip Cost, and Optional the next by reconciling it to an Option instead — same type, different lane.)

**Lane A — "Included" (`included_in_trip_cost = true`).** Part of the single base price every on-roster member pays, so everyone attending is **auto-enrolled**, with **no separate charge**. The member doesn't opt in; attending *is* opting in. (Scramble/calcutta/ryder are the usual residents, but that's a reconciliation choice, not a type rule.)

**Lane B — "Optional" (anything not in Trip Cost).** Must be represented to the member as an **Option** they opt into (all-or-nothing; may bundle *many* contests). **Opt-in does NOT imply paid — zero-cost Options are expected and common** (e.g. an optional-but-free Ryder Cup: "are you playing? yes/no"). When it does cost, one price covers the bundle: the "Closest to the Pin" Option is **$15** and enrolls you in all **6** daily CTP contests (6 × $2.50); the member sees one line, never the six inside.

**Trip Cost is just one special Option** — auto-derived, always-included, price = `SUM(cost_items WHERE included_in_trip_cost)`. So the member's entire financial view is "a list of Options," Trip Cost being the first (mandatory, derived) one.

The **ledger** (`v2_financial_transactions`, mirroring v1) records per-member charges/payments; net balance stays derived (`payments − charges`). Catalog (`v2_cost_items`) = "what things cost"; ledger = "what *this member* owes."

## Participation is independent of attendance (load-bearing principle)

Contest participation (`v2_contest_participants`) is its **own** source of truth. Attendance only *seeds* it (auto-enroll for Included contests) — it never constrains it, and edits are **never blocked** ("we can't be too sticky"). All of these are first-class:
- **Attending but not in a contest** — registered for the whole event, had to leave Friday early → pulled from Friday cornhole + Saturday contests, still on roster.
- **In a contest but not attending** — a local drives in only for the Saturday round → added to that one contest, never on the roster, never paid Trip Cost.

Billing decouples the same way: Trip Cost is charged to the roster, and per-contest divergences (the drop-in's one-off round, the early-leaver's credit) are reconciled with manual ledger entries — not by forcing participation to match attendance. This is a core reason the money model is a ledger, not a derived-only rollup.

## Sub-issues

- [ ] **#215 — Attendance ↔ contest enrollment sync (Lane A)** — auto-enroll on attend, import attendees into a newly added contest (all/subset), opt-out tombstone, participants write API. (challenge #1)
- [ ] **#216 — Options layer + per-member ledger + balances (Lane B + money)** — `v2_options` + selections + `v2_financial_transactions`; Option select → one charge + enroll into bundled contests; member-facing balance + admin per-member reconcile. (challenge #2)
- [ ] **#217 — Attendance-change integrity + admin alerts (Lane A integrity)** — guarded removal, member-RSVP hard-cascade vs admin-toggle guarded, and the new immediate **admin notification** (in-app + push) when a status change orphans a team seat / tee time. Depends on #215. (challenge #3)

## Build order
#215 → #216 → #217. (#217 needs #215's sync engine; #216 is independent of #217 and can overlap with #215.)

## v1 precedent to mirror
- `src/lib/attendance-contest-sync.ts` — the blanket auto-enroll + guarded removal engine.
- `src/lib/option-contest-sync.ts` — Option select/deselect → enroll/remove across all bundled contests.
- `financial_transactions` (ledger) + `src/app/api/financials/me/route.ts` — derived net balance.
- `trip_options` (incl. `option_type='trip_cost'`), `cost_items.linked_option_id`, `cost_item_option_choices` — the Option→cost→contest wiring.
- `contests.auto_enroll_attendees`, `contest_enrollment_exclusions` — the blanket flag + opt-out tombstone.

## Parity note
v1 surfaced guarded-removal warnings in the API response but the admin UI silently discarded them (`AttendanceGrid.tsx`). v2's win: a real notification system (`v2_notifications` + `sendV2Notifications` + web push) lets us alert admins immediately. Sub-issue 3 is explicitly the fix for that gap.
