# Feature: Sim-mode data generators — populate the test event with sample data

## Overview

Follow-up to **#126 (admin sandbox)**. That issue shipped the isolation layer: a permanent `status='test'` event, a per-admin sim-mode cookie, `getEffectiveTripId()` everywhere, dispatch guards on notifications / chat / activity log, and a sim banner in the admin + app layouts. What's missing is a way to *fill* the test event with realistic data so admins can actually verify leaderboards, payouts, the Winners grid, financial views, etc.

This issue adds per-module populate generators + a wipe button, all scoped to the test event's `trip_id`. Real data is structurally untouchable (different trip_id, every query scoped by trip_id, FK isolation via #126).

## Hard prerequisite

The test event must already have its contests / options / cost_items set up before generators are useful. **The admin sets that up manually via the existing event-management admin tools** (using sim mode so they're operating on the test event). Generators populate the *score-and-winner* layer on top of an existing contest structure — they don't auto-create contests.

This is a feature, not a bug:
- Forces the admin event-creation flow to get exercised end-to-end (#126's original second motivation)
- Keeps the generators simple — they don't need to know the right contest shape, they just write scores against whatever exists
- Means the test event can mirror the real active event's shape exactly, or diverge intentionally to exercise edge cases

If admin clicks "Populate scrambles" against a test event that has no scramble contests, the generator returns "no scramble contests found" gracefully.

## Modules to support

| Module | Generates | Tables touched | Materializer triggered |
|---|---|---|---|
| Roster + enrollment | `event_participants` rows for every active Loozer; `contest_participants` for every payout-bearing contest in the test event | `event_participants`, `contest_participants` | none directly |
| Scramble teams | Auto-team into 3/4-player teams; computes `team_handicap` from members' indices | `scramble_teams`, `scramble_team_members` | `materializeScrambleTeamWinners` (once scores land) |
| Scramble scores | 18 holes per team per day; weighted around par (~70% par, ~15% bogey, ~10% birdie, ~5% double-or-worse) | `scramble_hole_scores`, optional `scramble_bonus_points` | `materializeScrambleTeamWinners`, `materializeSkinsWinners` |
| Daily contests | Random eligible winner per (day × contest_type) for CTP front/back, LD, LP | `contest_winners` (place=1) | `materializeDailyContestWinner` |
| 100 Feet | Per-attendee per-day distance; weighted toward "100ft default" with occasional close shots | `hundred_feet_scores` | `materializeHundredFeetWinners` |
| Pickem | Random picks per Loozer per game | `pickem_picks` | `materializePickemWinners` |
| Calcutta | Random bids on teams; one winning team per scramble auction | `calcutta_bids`, `contest_winners` (Calcutta-specific) | n/a |
| Cornhole singles + doubles | Generated bracket with random match outcomes (singles is single-elim; doubles uses the contest's `bracket_format`) | `cornhole_bracket_matches`, `cornhole_scores` | (no automatic payout materializer today) |
| KGB Cup | Pairs assignments + per-hole match-play scoring | `kgb_cup_pairs`, `kgb_cup_foursomes`, `kgb_cup_hole_scores`, `kgb_cup_player_handicaps` | n/a (live-computed standings) |
| Tee times | Auto-assign slots based on scramble teams; one tee time per team per day | `tee_times`, `tee_time_players` | n/a |

## Architecture

### File layout

```
src/lib/sim/
  generators/
    roster.ts
    scramble.ts
    daily-contests.ts
    hundred-feet.ts
    pickem.ts
    calcutta.ts
    cornhole.ts
    kgb-cup.ts
    tee-times.ts
  wipe.ts          // scoped deletes for the test trip
  shared.ts        // weighted-random helper, test-event id resolver
```

### Generator contract

Every generator exports a function with this signature:

```ts
async function generateScrambleScores(
  client: SupabaseClient,
  testTripId: string,
  options?: { seed?: number },
): Promise<{ inserted: number; skipped: number; warnings: string[] }>;
```

- Takes the **test event's `trip_id` explicitly** — never reads "active trip" internally. Enforced via lint / convention.
- Idempotent within a run: re-running the same generator deletes existing scoped rows first and re-inserts. This is the standard "wipe + repopulate this slice" pattern.
- Returns a small status object so the UI can show "wrote N rows" feedback.
- `seed` is optional — when set, the random distributions become deterministic. v1 ships without seed wiring; can be added later if a bug needs reproducing.

### Wipe contract

```ts
async function wipeTestEventData(
  client: SupabaseClient,
  testTripId: string,
  scope: "all" | { modules: ModuleName[] },
): Promise<{ deleted: Record<string, number> }>;
```

`scope: "all"` clears every data row across every module (scores, participants, winners, picks, bids, brackets). It keeps the structural rows (contests, options, cost_items) intact so the admin doesn't have to reconfigure the test event each run.

`scope: { modules: [...] }` wipes only the selected modules — useful for testing one slice in isolation.

### Critical invariant: every write references the test trip_id

A test-only invariant enforced via convention:

> Every INSERT in `src/lib/sim/generators/*` must reference `testTripId` (directly via a column or transitively via `contest_id`). No generator may query for the "active trip" — that resolver returns the *effective* trip, which when sim mode is on is also the test event, but when sim mode is off would be the real active trip. The required-`testTripId` parameter makes the invariant impossible to violate accidentally.

A unit test (once test infrastructure from #127 lands) asserts that no generator's output rows have a trip path resolving to anything other than the supplied test trip.

## Admin UI

Extend the existing **Trip Simulator** card on `/admin/simulator` (built in #126) with a populate / wipe section that's visible only when sim mode is active.

```
┌─ Trip Simulator (sim mode ACTIVE) ─────────────────┐
│ Test event: 🧪 Test Event (2026)                   │
│ [ Exit sim mode ]                                  │
│                                                    │
│ ── Populate test event ──                          │
│ ☐ Roster & enrollment                              │
│ ☐ Scramble (teams + scores)                        │
│ ☐ Daily contests (CTP / LD / LP)                   │
│ ☐ 100 Feet                                         │
│ ☐ Pickem                                           │
│ ☐ Calcutta                                         │
│ ☐ Cornhole                                         │
│ ☐ KGB Cup                                          │
│ ☐ Tee times                                        │
│   [ Populate selected ]   [ Populate everything ]  │
│                                                    │
│ ── Wipe test event data ──                         │
│ Clears scores, participants, winners. Keeps the    │
│ test event's contests / options / cost items.      │
│   [ Wipe all data ]   [ Wipe selected modules ]    │
└────────────────────────────────────────────────────┘
```

Hidden entirely when sim mode is off — admin must enter sim mode to access. This is symmetric with the architectural invariant: the populate/wipe actions only operate against the test event, and you have to be "in" it to use them.

Each populate / wipe action confirms once before running. Wipe-all confirms twice ("type WIPE to continue") since it's destructive within the test event (though still structurally incapable of touching real data).

## API surface

Three new routes under `/api/admin/sim/`:

| Method | Endpoint | Body | Purpose |
|---|---|---|---|
| POST | `/api/admin/sim/populate` | `{ modules: ModuleName[] }` or `{ all: true }` | Runs the named generators against the test event |
| POST | `/api/admin/sim/wipe` | `{ modules: ModuleName[] }` or `{ all: true }` | Wipes data scoped to test event |
| GET | `/api/admin/sim/state` | — | Returns per-module status: row counts, last-run timestamps |

All three require admin auth AND require that sim mode is active (cookie set). If sim mode is off, return 400 with "Enter sim mode first." This prevents accidental invocation against the real active trip even via direct API calls.

## Generation defaults (v1)

No presets in v1 — generators use realistic-but-fixed distributions:

- **Scramble scores**: per-hole weights — par 70%, bogey 15%, birdie 10%, double-or-worse 5%
- **Daily contests**: uniform random pick from eligible attendees per slot
- **100 Feet**: ~30% "100ft default" (no successful putt), ~50% in 20–60 ft range, ~20% in 5–20 ft range
- **Pickem**: 50/50 random picks per game per Loozer
- **Calcutta bids**: random bid amounts between $5 and $50, biased toward lower scramble-team-handicap teams (i.e., favorites get higher bids)
- **Cornhole**: random match outcomes; the bracket structure is determined by the contest config
- **KGB Cup**: per-hole match-play outcomes biased slightly toward the lower-handicap player

Presets ("tied leaders", "no winners", "low scoring", "single dominance") and seeded randomness can land in a v2 follow-up once we know what scenarios actually need exercising.

## Phases

### Phase 1 — Foundation + roster + scramble
- File layout: `src/lib/sim/{generators,shared,wipe}.ts`
- `shared.ts` helpers: weighted random, seeded random (stub for now), test-event resolver, attendee fetcher
- `wipe.ts` with scope-keyed deletes for every module table
- Roster + enrollment generator
- Scramble teams + scores generator
- Trigger `materializeScrambleTeamWinners` + `materializeSkinsWinners` after scramble scores write
- Admin UI: extend the Trip Simulator card with populate-scramble + wipe-all buttons
- API routes wired

### Phase 2 — Daily contests, 100 Feet, Pickem
- Generators for daily contests, 100 Feet, Pickem
- Materializers chained for each (`materializeDailyContestWinner`, `materializeHundredFeetWinners`, `materializePickemWinners`)
- UI: add the remaining checkboxes

### Phase 3 — Calcutta, Cornhole, KGB Cup, Tee times
- Calcutta bidding + winner selection
- Cornhole bracket walk-through (single-elim + the various `bracket_format` shapes for doubles)
- KGB Cup pairs + foursomes + hole-by-hole match play
- Tee time auto-assignment
- "Populate everything" orchestrator that runs the lot in dependency order

### Phase 4 — Polish
- Per-module last-run / row-count status on `/admin/simulator`
- Loud confirmation dialogs on wipe-all
- README + CLAUDE.md updates with the sim workflow

## Acceptance criteria

- [ ] Admin can populate the test event one module at a time from `/admin/simulator` (sim mode required)
- [ ] Admin can populate everything in one click
- [ ] After populate, every leaderboard renders realistic data when sim mode is on
- [ ] After populate, the Winners grid + Payout Denominations populate correctly
- [ ] After populate, financial views render with realistic charges/payouts for the test event
- [ ] Wipe-all clears every data row scoped to the test event while keeping structural rows (contests, options, cost_items) intact
- [ ] Wipe-selected clears only the chosen modules
- [ ] No generator can write rows whose trip path resolves to anything other than the supplied test trip
- [ ] Generators are idempotent within a run (re-running clears existing scoped rows first)
- [ ] Generators gracefully skip modules whose underlying contest doesn't exist in the test event (e.g., "no scramble contests configured — skipping")
- [ ] Sim-mode requirement enforced at the API layer — populate/wipe routes 400 when sim mode is off

## Decisions to lock in before starting

1. **Realism vs. simplicity for v1**: fixed default distributions, no presets, no seeded randomness. Lean: yes — defer presets to v2.
2. **Wipe scope**: "data only" (scores/participants/winners) keeps contests intact. Lean: yes — admin doesn't want to re-set-up the test event each time.
3. **Roster source**: which users get rostered? All `is_active=true` Loozers? A subset? Lean: all active non-`is_financial_only` Loozers.
4. **Materializer triggering**: explicit (admin clicks a re-materialize button) or implicit (generator triggers them automatically). Lean: implicit — admin shouldn't have to think about it.

## Effort estimate

- Phase 1 (foundation + roster + scramble): **2–3 days**
- Phase 2 (daily / hundred-feet / pickem): **2–3 days**
- Phase 3 (calcutta / cornhole / kgb-cup / tee-times + orchestrator): **2–3 days**
- Phase 4 (polish): **1 day**

Total: **~7–10 days active coding**. Each generator is ~50–150 lines of straightforward data shaping plus its materializer call.

## Dependencies

- **Depends on #126 (admin sandbox).** ✅ Shipped — sim mode toggle, test event isolation, dispatch guards all in place.
- **Synergy with #127 (test infrastructure).** Once Tier 2 (Supabase integration) lands, every generator gets a unit-style test that asserts row counts + scoped trip_id.
- Builds on the post-#124 contest spine — every materializer triggered after populate is already implemented.
- No other feature dependencies.
