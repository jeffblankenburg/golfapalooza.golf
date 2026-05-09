# Refactor: Unified contest / winner / payout data model

## Status

**Committed for this off-season.** Target completion: well before the next
trip's active window opens (~120 days from filing). Until then, the bridge
layer (`payout_sheet_events.winner_source`) keeps the current surface
working.

## Depends on #125 (do this first)

#125 (`cost_items`) is the predecessor. Once cost items are the universal
source of truth for dollars, the contest model collapses to two simple
responsibilities:

> **A contest points at a cost item as its buy-in, and defines how the
> winnings are divided. That's it.**

Every other concept that's currently fragmented across the codebase —
pot total, payout amount, paid status, denomination calculation —
derives from those two facts plus the people who participated.

What that means for this plan:

- **`contests.buy_in` column is no longer needed** — buy-in derives from
  cost items targeting the contest (`cost_items.payout_target_contest_id =
  contest.id`). The "buy-in cost item" is the contest's pot per attendee.
- **`pot_source` / `fixed_pot` columns on `contests` are no longer needed**
  — every pot has the same shape (cost item × eligible attendee count).
- **`contest_payout_structure` only describes the SPLIT** of an existing
  pot (e.g. "1st = pot − $80, 2nd = $80" or "60/30/10"), never the dollar
  amount of the pot itself.
- **The Skins child-contest pattern (`parent_contest_id`) gets cleaner** —
  its pot is one cost item targeting the Skins contest.

So the work below assumes #125 has shipped first.

## What a contest IS, after this lands

```sql
contests
  id, trip_id
  name, contest_type
  parent_contest_id            -- only for child contests like Skins

  -- The two responsibilities:
  -- 1. Buy-in: a single FK to the cost item that funds this contest's pot.
  --    Pot total = buy_in_cost_item.cost × eligible attendee count.
  --    NULL only for special cases like Calcutta where the pot is bid-driven.
  buy_in_cost_item_id UUID REFERENCES cost_items(id) ON DELETE SET NULL,

  -- 2. Winnings split: rows in `contest_payout_structure` describe how
  --    the pot divides among placements. No dollars stored here.

contest_payout_structure
  id, contest_id, place
  label                  -- "1st place" / "2nd place" / "Long shot bonus"
  percentage NUMERIC(5,2)         -- e.g. Calcutta 1st = 20% of pot
  flat_amount NUMERIC(10,2)       -- e.g. scramble 2nd = flat $80
  remainder BOOLEAN               -- true on the row that absorbs whatever's left
                                  -- (e.g. scramble 1st = "remainder" after $80
                                  -- to 2nd)
```

That's the entire contest model. Two tables, one FK to the cost catalog,
no per-contest-type magic columns, no hidden conventions. Adding a new
contest is:

1. Insert a `cost_items` row (the buy-in)
2. Insert a `contests` row pointing at it via `buy_in_cost_item_id`
3. Insert `contest_payout_structure` rows describing the split

Done — no code change required.

## Hard constraints (non-negotiable)

1. **Zero downtime.** The site stays fully functional throughout every
   phase of the migration — including admin tools, leaderboards, scoring,
   the cash-needed sheet, and the Winners grid.
2. **Zero broken features at any point.** No phase ships in a state where
   a feature works "after the next phase lands." Each phase is independently
   shippable and reversible.
3. **Production-safe rollout.** Schema changes use additive patterns
   (new columns, new tables, double-write triggers). No destructive change
   lands until the new path has been verified in production for at least
   one full week of normal admin usage.
4. **Reversible per-phase.** Every phase has a documented rollback path
   that does not require restoring from backup. If a phase regresses, we
   revert that phase and the prior phase's behavior remains intact.
5. **No mid-trip migration.** The destructive cleanup (Phase F) happens
   between trips only. Earlier additive phases can ship anytime.

## Why

The current data model has solved each contest type's needs cleanly in
isolation, but there is no single spine. The result is that anything that
wants a *cross-contest view* (the cash-needed sheet, the awards-banquet
winners grid, "who got paid what this trip", lifetime payout history) ends
up reimplementing the same aggregation across 5+ different shapes.

This issue is the path to a unified spine. The bridge layer
(`payout_sheet_events.winner_source`) handles the immediate surface area;
this refactor is the cleanup that lets future contest features build on a
single foundation instead of inheriting the fragmentation.

## Current state — what we have today

Five parallel "winner worlds":

| Contest type | Winners stored in | Payout schedule | Buy-in stored in | Paid flag |
|---|---|---|---|---|
| Calcutta auction | `contest_winners.prize_id` → `calcutta_prizes` | `calcutta_prizes.percentage` of pool | n/a (bid-driven) | none |
| Pickem | derived from `pickem_picks` rankings | `pickem_settings.payout_json` (`[{place, percentage}]`) | `pickem_settings.entry_fee` | `pickem_payouts.paid_out` |
| Daily contests (CTP front/back, LD, LP) | `daily_contest_winners` (per day, per type) | nowhere | `trip_options.cost` (varies per option) | `payout_paid_status` (#103 Phase 2) |
| Scramble Team | derived from `scramble_teams.gross_score` (top 2) | nowhere — admin convention `pot − $80 / $80` | implicit ($10 × player, hardcoded) | `payout_paid_status` |
| Scramble Skins | derived live from `calcSkins` over hole scores | nowhere — admin convention `team_skins / total × pot` | implicit ($10 × player, hardcoded) | `payout_paid_status` |
| 100 Feet | derived from MIN(`hundred_feet_scores`) | nowhere | `trip_options.cost` ($10) | `payout_paid_status` |
| Cornhole singles/doubles | derived from `cornhole_bracket_matches` championship winner | none — no payouts today | none | n/a |

Plus a sixth bridge layer, `payout_sheet_events` (issue #103), that the
admin uses to declare the cash-needed sheet — it has its own
`winner_source` enum so the cash-planning grid can find each winner. That
table papers over the fragmentation rather than removing it.

## Granularity mismatch

The `contests` table has rows for trip-level "contests" but the granularity
doesn't match what users actually win:

- **One scramble = one `contests` row** but pays out **two separate things**
  (Team + Skins) with different pots and different winner-determination
  rules. Today the pot/winners for Skins exists only as a live computation
  inside `/api/skins`.
- **Closest-to-the-Pin = one trip option** but pays out **two winners per
  day across three days** (CTP front + CTP back × 3). No `contests` rows.
- **Long Drive / Long Putt** pay out one winner per day across three days.
  No `contests` rows for the per-day instances.
- **Lodge Mon / Lodge Tue / Boland Bet / KGB Cup** are tracked as
  `trip_options`, not contests, even though Boland and KGB Cup involve
  buy-ins and KGB Cup awards a winner.

## Target model (assumes #125 shipped)

```
trip_settings                                                — events (unchanged)
event_participants                                           — users in events (unchanged)
trip_fee_components                                          — from #125; the spine for $$

contests
  id, trip_id, parent_contest_id (nullable, self-FK)
  name, contest_type, day_number (nullable)
  parent_contest_id lets Skins point at its scramble — single row, child of the
  scramble; same participants without re-storing them.
  -- buy_in / pot_source / fixed_pot all dropped in favor of line-item lookup

contest_participants                                          — used uniformly
  contest_id, user_id, joined_at, ...
  Skins inherits from parent (no own rows); Calcutta uses bid-bearing rows.

contest_payout_structure                                      — one source of truth
  contest_id, place SMALLINT, label TEXT
  -- pot total derives from trip_fee_components.payout_target_contest_id
  -- this table only describes how to SPLIT that pot:
  percentage NUMERIC(5,2) (e.g. Calcutta 1st = 20%)
  flat_amount NUMERIC(10,2) (e.g. scramble 2nd = flat $80, 1st = remainder)
  remainder BOOLEAN (true on the row that absorbs whatever's left)
  Replaces calcutta_prizes, pickem_settings.payout_json, and the cash-sheet
  conventions in payout_sheet_events.

contest_winners (generic)                                     — one source of truth
  contest_id, place SMALLINT, user_id, partner_user_id (nullable, doubles cornhole)
  determined_at, determined_by ('rule' | 'manual')
  paid BOOLEAN, paid_at TIMESTAMPTZ, paid_by UUID (FK users)
  Replaces today's contest_winners (Calcutta-only), daily_contest_winners,
  pickem_payouts paid flag, payout_paid_status, derivable winners.
  For derivable winners (scramble gross_score, skins live compute, hundred_feet
  min, pickem rankings, cornhole bracket), a "winner-resolution" job materializes
  them into this table when the contest is locked. That keeps reads simple.

-- per-type detail tables stay, anchor to a contest:
scramble_teams (contest_id, ...) — gross_score etc. (unchanged)
scramble_team_members
scramble_hole_scores
calcutta_bids                    — replaces calcutta-specific fields on contest_participants
pickem_games / pickem_picks
cornhole_bracket_matches
hundred_feet_scores              — gains a contest_id column
```

What goes away:
- `payout_sheet_events` — the cash-needed sheet becomes a SQL view over
  `contests` × `contest_payout_structure` × `contest_participants`
- `payout_paid_status` — paid flag moves onto `contest_winners`
- `daily_contest_winners` — folded into `contest_winners` keyed on the new
  per-day-per-contest-type contest rows
- `pickem_payouts` — folded into `contest_winners` paid flag
- `calcutta_prizes` — replaced by `contest_payout_structure` rows
- The aggregator `src/lib/payout-events/grid.ts` — most of it becomes a
  thin SELECT
- The label-substring `classify()` history (already replaced by
  `winner_source` column for the bridge layer) is no longer needed at all

## Migration plan

Six phases, each independently shippable. **Old code paths keep
running unchanged until a phase is explicitly retired in a later phase.**
Every phase ends with the site fully functional and includes an explicit
verification step plus a rollback path.

### Phase A — schema foundation (purely additive)

**Pre-condition:** #125 has shipped — `trip_fee_components` exists and is
the source of truth for pot totals.

**What ships:** New tables + new nullable columns. No code reads or writes them yet.

1. New table: `contest_payout_structure` (split percentages / flat amounts only — pot total comes from line items).
2. New column on `contests`: `parent_contest_id UUID` (nullable, self-FK).
3. New columns on existing `contest_winners`: `paid BOOLEAN DEFAULT false`,
   `paid_at TIMESTAMPTZ`, `paid_by UUID`. Used later; default-safe.

**Old paths still work:** All five winner worlds query their existing tables
exactly as before. Nothing reads the new columns yet.

**Verification:** schema migration runs, type-check passes, full app smoke
tests pass with no behavior change.

**Rollback:** drop the new columns/table — they have no consumers.

### Phase B — generate missing contest rows (additive backfill)

**What ships:** New rows in `contests` for the granularity gaps, plus
`contest_payout_structure` rows describing how each splits its pot. No
reads or writes change yet.

1. Insert `contests` rows for: Skins-per-scramble (with `parent_contest_id`),
   CTP Front × 3, CTP Back × 3, Long Drive × 3, Long Putt × 3.
2. Populate `contest_payout_structure` for every payout-bearing contest
   (existing + new) — only the SPLIT (percentages or flat amounts);
   pot totals come from #125 line items.
3. Update existing `trip_fee_components` rows from #125 to point at the new
   contest rows (e.g. "Thursday Skins pot" line item now targets the new
   Thursday Skins contest, not the scramble).
4. Set `parent_contest_id` on new Skins rows; existing scramble rows are
   unchanged.

**Old paths still work:** No leaderboard, admin tool, or aggregator queries
the new rows yet.

**Verification:** spot-check 5+ rows from each backfill against the existing
sources of truth. The `payout_sheet_events` cash sheet still produces
identical totals.

**Rollback:** delete the new contest rows + structure rows. Contests created
in Phase B are tagged with a `migration_origin` flag (e.g. `'data_model_v2'`)
so deletion is precise.

### Phase C — write winners into generic table (double-write, no read switch)

**What ships:** Triggers / jobs that materialize winners from existing
sources into `contest_winners` whenever they change. Old tables remain the
authoritative read source.

1. For each existing winner source, add a job/trigger that writes to
   `contest_winners` whenever the source changes:
   - `daily_contest_winners` insert/update → write `contest_winners`
   - Calcutta winner resolver → also write to `contest_winners` (new generic rows)
   - Scramble lock action → materialize 1st/2nd from `gross_score` ordering
   - Skins lock action → materialize from live `calcSkins`
   - Hundred Feet lock action → materialize from MIN(`hundred_feet_scores`)
   - Pickem lock action → materialize from rankings + `payout_json`
2. One-shot backfill for historical winners.

**Old paths still work:** Every leaderboard / admin tool still reads from
its existing source. `contest_winners` is double-written but not yet read.

**Verification:** for every contest with winners, assert the generic
`contest_winners` rows match the source-of-truth tables. Run the assertion
on every page load behind a debug flag for a week before moving on.

**Rollback:** disable the triggers; truncate the new rows. No source-of-truth
data is touched.

### Phase D — switch reads, one feature at a time

**What ships:** Each leaderboard / admin tool flips its read to
`contest_winners` (or the generic structure tables) one at a time. Behind
a feature flag where practical.

Order of switches (each independently shippable + revertible):
1. Cash-needed sheet (Payout Denominations tab) reads from
   `contest_payout_structure`.
2. Winners grid (`/admin/financials/grid` Winners tab) reads from
   `contest_winners`.
3. Daily Games leaderboard.
4. Hundred Feet leaderboard.
5. `/api/skins` payout amount lookup.
6. Pickem leaderboard.
7. Calcutta winner display.

**Old paths still work:** Each switch leaves the source-of-truth tables
intact and double-written. If a switch regresses, the feature flag flips
back without a code deploy.

**Verification:** each read switch ships behind a flag + side-by-side
verification log (compare new vs. old result, alarm on mismatch). After
one week of clean alarms in production, the flag is removed.

**Rollback:** flip the feature flag. Source data is unchanged.

### Phase E — switch writes (still no destructive change)

**What ships:** Admin tools that *declare* winners now write to
`contest_winners` as their primary path. Old tables become reverse-synced
(write to `contest_winners`, mirror back to old table for any code still
reading old).

1. Calcutta resolver writes to `contest_winners` directly (still mirrors to
   old `contest_winners` view if any consumers remain).
2. Daily-winners admin writes to `contest_winners`; mirror trigger
   maintains `daily_contest_winners` for any straggler readers.
3. Pickem lock writes the rankings into `contest_winners` directly.
4. Scramble lock writes 1st/2nd team payouts into `contest_winners`.
5. Hundred Feet lock writes the winner into `contest_winners`.
6. Paid-status writes go to `contest_winners.paid` instead of
   `payout_paid_status` / `pickem_payouts.paid_out`.

**Old paths still work:** Mirror triggers keep the legacy tables populated
in case something still reads them.

**Verification:** week of live traffic with mirror triggers active. Audit
that legacy tables stay consistent with `contest_winners`.

**Rollback:** swap the trigger direction; legacy tables resume primary write.

### Phase F — destructive cleanup (between trips only)

**Pre-condition:** All reads in production have used the new tables for at
least one full trip cycle. No regressions outstanding.

1. Drop mirror triggers. Legacy tables stop receiving writes.
2. Drop legacy winner tables: `daily_contest_winners`, `pickem_payouts`,
   `payout_paid_status`. Keep schema views named the same for one release
   cycle if anything external reads them.
3. Drop `payout_sheet_events` and the bridge `winner_source` column —
   replaced by `contest_payout_structure` joined to `contests`.
4. Delete the aggregator's classify/dispatch logic; replace with a single
   SELECT in `loadPayoutGrid`.
5. Update CLAUDE.md schema map; remove deprecated table references.

**Old paths:** None remaining. Phase F is the only phase where a piece of
the old system is removed.

**Rollback:** This phase is harder to roll back (DROP is destructive). Run
only after Phases A–E have been live for an entire trip cycle without
regressions, and only between trips.

## Per-contest-type migration table

(Pot totals come from #125 line items in every case — column omitted.)

| Contest | Generate `contests` rows? | Backfill payout SPLIT structure | Migrate winners from |
|---|---|---|---|
| Calcutta auction | already exists | from `calcutta_prizes.percentage` | `contest_winners` (rename current) |
| Scramble Team | already exists | flat 2nd-place $80, 1st = remainder | derive from `scramble_teams.gross_score` |
| Scramble Skins | **new** (parent = scramble) | percentage-by-skins-share | `calcSkins` materialization on lock |
| Pickem | already exists | from `pickem_settings.payout_json` | derived rankings materialization on lock |
| CTP Front × 3 days | **new** | full pot to single winner (with fall-through rule for unwon sibling) | from `daily_contest_winners` (ctp_front per day) |
| CTP Back × 3 days | **new** | same | from `daily_contest_winners` (ctp_back per day) |
| Long Drive × 3 days | **new** | full pot to single winner | from `daily_contest_winners` |
| Long Putt × 3 days | **new** | full pot to single winner | from `daily_contest_winners` |
| 100 Feet | already exists | full pot to lowest cumulative | derive from `hundred_feet_scores` |
| KGB Cup | already exists | none (pass-through) | n/a |
| Cornhole singles/doubles | already exists | none today (no payout) | n/a (or future) |

## What gets simplified after

- The cash-needed sheet is a single SQL query against three tables
- The Winners grid aggregator (`src/lib/payout-events/grid.ts`) shrinks from
  ~600 lines to ~50, and the per-kind handlers go away entirely
- Adding a new payout-bearing contest is one new row in `contests` plus
  rows in `contest_payout_structure` — no per-type code paths, no
  classifier
- "How much did Don win at Golfapalooza XXIX?" is a single query
- Lifetime accolades / payout history queries become trivial
- The fragility from label-substring matching disappears entirely

## Risks (and how the phasing addresses each)

- **Big surface area.** Touches Calcutta, Pickem, Daily Games, Hundred Feet,
  Scramble admin, plus the cash-needed and Winners grid. → Mitigated by
  switching ONE read at a time in Phase D with feature flags + side-by-side
  verification.
- **Mid-trip migration danger.** A schema change during an active trip
  could destroy live data. → Hard rule: Phase F (the only destructive
  phase) runs between trips. Phases A–E are additive and safe to ship
  any time.
- **Skins-as-child-contest** is a new pattern (`parent_contest_id`). The
  alternative — give Skins its own row at the same level as the scramble —
  is simpler but loses the "Skins shares the scramble's participants"
  invariant. → Worth deciding before Phase B; either approach is
  recoverable since Phase B is additive.
- **Calcutta percentages × auction pool** doesn't fit the simple
  "fixed amount per place" mental model — needs the `pot_source` discriminator
  to keep that math working. → Modeled explicitly via `pot_source` enum
  on `contests`.
- **Variable per-day payouts** (the CTP fall-through case where a missing
  winner shifts the pot to the sibling) need explicit modeling. → Encoded
  as a resolution rule on the contest row, not hardcoded in handler code.
- **Silent divergence between old and new tables during the dual-write
  window.** → Mitigated by the verification log in Phase C/D — every
  page load that reads a switched feature compares against the legacy
  source for one week before the flag is removed.

## Acceptance Criteria

- [ ] #125 has shipped (line-item spine in place)
- [ ] Every payout-bearing contest has at least one fee component targeting it (#125) and at least one row in `contest_payout_structure` describing the split
- [ ] Every contest's pot total is derivable as a SQL sum over `trip_fee_components`, not stored on `contests`
- [ ] `contest_winners` is the single source of truth for who won what — no other table needs to be queried for winner identity
- [ ] `contest_winners.paid` is the single source of truth for paid status
- [ ] The cash-needed sheet renders from `contests` × `contest_payout_structure` × `trip_fee_components` × `contest_participants` with no app-code aggregator
- [ ] The Winners grid aggregator file (`src/lib/payout-events/grid.ts`) is
      under 100 lines and contains zero per-kind dispatch
- [ ] Lifetime payout queries (e.g. "Don's total winnings across all trips")
      are a single SELECT
- [ ] All current functional surfaces still work: scramble admin, Calcutta
      auction, Pickem admin, Daily Games leaderboard, Hundred Feet
      leaderboard, awards banquet flow

## Effort estimate

With #125 already in place, this is **6–9 calendar weeks** for the
zero-downtime phasing (active coding ~3–4 days; the rest is verification
windows). The 120-day off-season window comfortably absorbs both #125 and
this issue back-to-back.

Suggested cadence (after #125 has shipped):
- Week 1: Phase A (schema foundation — smaller now, since `buy_in`/
  `pot_source`/`fixed_pot` are dropped)
- Week 2: Phase B (backfill missing contest rows + payout split structures)
- Weeks 3–4: Phase C (write triggers + one-shot historical backfill +
  verification week)
- Weeks 5–7: Phase D (switch reads one feature at a time, one per week,
  each behind a flag with a side-by-side verification log)
- Week 8: Phase E (switch writes with mirror triggers; live for a week)
- Week 9+ (between trips): Phase F (destructive cleanup)

## Dependencies

- **#125 must ship first.** This issue's plan assumes line items are the
  source of truth for pot dollars.
- Bridge layer (`payout_sheet_events.winner_source`) keeps the current
  surface working through every phase. No user-facing functionality
  pauses or breaks during the migration.
- Phase F MUST run between trips. All earlier phases can run during the
  trip lead-up; their additive nature makes them safe.
- Coordinate Phase F with the next trip's `status='active'` flip so
  destructive changes never coincide with active admin usage.
