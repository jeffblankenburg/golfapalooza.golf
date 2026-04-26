## Overview

Ingest 28 years of Golfapalooza history (1997–2024, 9 sheets, ~1,500 rows of scoring data + ~30 years of awards + ~100 Loozers' attendance and lifetime stats) from `Golfapalooza History.xlsx` into the app, and surface it through new "Hall of Fame," lifetime "Loozer Card," and historical-round-browsing views. Treat the spreadsheet as the seed for a permanent **historical layer** that lives alongside live-trip data and powers nostalgia, comparison, and bragging-rights features.

This is the largest data-import this app has ever attempted. It has to be done with care because it materially affects identity (linking historical Loozers to current user accounts), records (lifetime stats, award counts), and the way the app answers "who's the GOAT?"

## What's in the workbook

There are 9 sheets totaling ~573 KB of structured history. Inventory:

| Sheet | Rows × Cols | What it holds |
|---|---|---|
| **Summary** | 104 × 18 | One row per Loozer with lifetime totals: years attended, MVL/ROY/MELC/BSPITW/Green Jacket count, singles/doubles cornhole wins, indv rounds + average, scramble rounds + average, holed shots, par-3 count, total awards |
| **Awards** | 36 × 10 | One row per year (1997–2024). Year, Roman numeral generation name (GI…GXXVIII), MVL, ROY, MELC, Green Jacket, BSPITW, Singles Cornhole, Doubles Cornhole (two name columns) |
| **Attendance** | 106 × 38 | Loozers × years grid 1997–2030. "Y" if attended. Header row carries each year's attendance count |
| **Scramble Rounds** | 563 × 82 | Per-year per-round per-loozer scramble scoring. Year, Round#, Loozer, Total Points, Team#, individual HDCP, then 4 blocks of 18 holes + total: (1) team gross, (2) team to-par, (3) per-individual hole-by-hole (likely points or net), (4) another scoring block |
| **Indv Rounds** | 748 × 40 | Per-year per-round per-loozer individual scoring. Loozer, Year, Round, 18 holes raw + total, 18 holes to-par |
| **Indv Average** | 100 × 43 | Per-Loozer hole-by-hole average score, total average, second block reserved for something (currently empty) |
| **Indv Best** | 104 × 137 | Per-Loozer hole-by-hole personal best, total, aggregate counts of eagles/birdies/pars/bogeys/dbl-bogeys/other, then per-hole counts of each (18 holes × 6 stats = 108 columns) |
| **Indv Hole Difficulty** | 90 × 40 | Per-hole difficulty stats (avg-to-par, handicap, par), with year-over-year breakdowns |
| **Scramble Hole Difficulty** | 1 × 1 | Empty placeholder |

**Year coverage:** 1997 through 2024 for results; attendance grid extends through 2030. Generations are Roman-numeral-named (G I → G XXVIII as of 2024). Two notable holes in the data: 2008 has no ROY listed, 2020 has no MVL/ROY (likely the COVID year).

**Loozer naming:** the workbook joins on a `Loozer` column = `FirstNameLastName` with no spaces (e.g. `JeffBlankenburg`). Our `users.display_name` likely doesn't match this format — name reconciliation is the central import-time challenge.

**Awards taxonomy** (acronyms guessed from context — confirm before shipping copy):
- **MVL** — Most Valuable Loozer (best individual scoring across the trip)
- **ROY** — Rookie of the Year (best first-year Loozer)
- **MELC** — possibly "Most Embarrassing Loozer Cup" (worst score / shame trophy)
- **Green Jacket** — likely scramble winner / signature trophy
- **BSPITW** — Best Shot Played in the World? (signature shot of the trip)
- **Singles Cornhole** — solo cornhole champion
- **Doubles Cornhole** — two-person team

## Why this is harder than it looks

1. **Identity reconciliation.** ~100 names in the workbook → most are NOT in the current `users` table (we only have current-attendee accounts). Some current users may have a different `display_name` than their workbook name (`JeffBlankenburg` vs `Jeff B.`). We need a one-time matching step with admin review before any historical record gets linked to a live account.
2. **Scoring data has no course context.** The workbook stores per-hole pars at the *header* level (one set of pars across all rounds) — but the actual courses played varied year to year. The scoring data is intelligible without a per-year course only because Golfapalooza historically played the same course (Oglebay's Crispin?) for many years. Verify with you before assuming.
3. **Handicap math will not work for historical rounds.** USGA handicap requires slope/rating per tee. We don't have either for historical courses. Historical rounds must be excluded from the active handicap calculator or marked `do_not_index`.
4. **The fourth scoring block in `Scramble Rounds`** isn't documented and the totals don't quite add up the way I'd expect. Need either a legend from you or a careful empirical reverse-engineering pass before importing or display.
5. **Some Loozers in the spreadsheet have `'N/A'` averages and `0` rounds** — non-playing attendees (caddies? family?). Need to decide whether to import as users at all.

## Proposed approach: three layers

### Layer 1 — Storage: a parallel "history" namespace

Mirror the live tables, prefixed `historical_`. This keeps the live handicap/leaderboard logic untouched while preserving full fidelity of the historical data.

```sql
historical_loozers (
  id uuid PK,
  workbook_name text UNIQUE,        -- 'JeffBlankenburg'
  first_name text, last_name text,
  user_id uuid REFERENCES users(id), -- NULL until reconciled
  reconciliation_status text         -- 'matched' | 'unmatched' | 'ignored'
)

historical_trips (
  id uuid PK,
  year int UNIQUE,
  generation_name text,              -- 'GXXVIII'
  attendee_count int,
  course_id uuid REFERENCES courses(id) NULL  -- backfilled per year if known
)

historical_attendance (
  trip_id uuid REFERENCES historical_trips(id),
  loozer_id uuid REFERENCES historical_loozers(id),
  PRIMARY KEY (trip_id, loozer_id)
)

historical_rounds (
  id uuid PK,
  trip_id uuid REFERENCES historical_trips(id),
  loozer_id uuid REFERENCES historical_loozers(id),
  round_number int,                  -- 1, 2, 3
  round_format text,                 -- 'individual' | 'scramble'
  team_number int NULL,              -- scramble only
  team_handicap int NULL,            -- scramble only
  total_points int NULL,             -- scramble individual points
  gross_total int,
  par_total int                      -- inferred from per-hole pars
)

historical_round_holes (
  round_id uuid REFERENCES historical_rounds(id) ON DELETE CASCADE,
  hole_number int,
  par int,
  gross_score int,
  to_par int,
  PRIMARY KEY (round_id, hole_number)
)

historical_awards (
  id uuid PK,
  trip_id uuid REFERENCES historical_trips(id),
  award_type text,                   -- 'mvl' | 'roy' | 'melc' | 'green_jacket' | 'bspitw' | 'cornhole_singles' | 'cornhole_doubles'
  loozer_id uuid REFERENCES historical_loozers(id),
  team_partner_id uuid NULL          -- for doubles cornhole
)
```

Why a parallel namespace, not unified tables:
- Historical rounds have no slope/rating, so they can't feed the existing handicap calc.
- Historical Loozers may include people who never opt in to a real user account (or who've passed away, etc.) — they shouldn't show up in chat / RSVP / financial pickers.
- Schema can evolve independently. We can later promote individual records to live tables (e.g., for a current user who wants their lifetime stats unified) without affecting the rest.

### Layer 2 — Ingestion: a one-shot script + admin reconciliation UI

**Step 1: Parse + dry run**
- New script `scripts/import-history.mjs` reads the XLSX (using `xlsx` npm package), validates structure, prints a per-sheet summary.
- Before any DB write, dumps a JSON preview to `tmp/history-preview-{stamp}.json` for review.

**Step 2: Identity reconciliation (admin UI)**
- New admin page `/admin/history/reconcile` shows every workbook Loozer in three buckets:
  - **Auto-matched** (workbook_name normalized to a unique current user — e.g. `JeffBlankenburg` ↔ user with display_name "Jeff Blankenburg")
  - **Suggested** (fuzzy match needs confirmation)
  - **Unmatched** (no current user — admin can either create a placeholder `historical_loozers` row or link to an existing one manually)
- Save reconciliation decisions to `historical_loozers.user_id`.
- This is the only blocking step. Everything else can run unattended.

**Step 3: Idempotent import**
- New admin page `/admin/history/import` triggers the actual write.
- Import runs in transaction, ON CONFLICT DO NOTHING for re-runs, returns counts: trips imported, awards, individual rounds, scramble rounds, holes.
- Logs per-row anomalies (missing data, bad parsing) to a new `historical_import_log` table for inspection.

**Step 4: Verification report**
- After import, page shows: total rounds imported per year, totals per-Loozer cross-checked against the Summary sheet, list of any cells we couldn't parse.

### Layer 3 — Display: where the data shows up in the app

#### 3a. Loozer profile page → "Lifetime Stats" tab
On any Loozer's profile (`/loozers/[id]` and own `/profile`):
- Lifetime totals card: years attended, indv rounds + avg, scramble rounds + avg, holed shots, par-3 count, awards won (broken out by type).
- "Awards" timeline: chronological list of trips with the awards they won that year. Each award has its own icon/color.
- "Years attended" sparkline (one block per year 1997–present, filled if attended).
- Best/worst round of all time + the year it happened.

#### 3b. New section: `/hall-of-fame`
Public top-level page with sub-views:
- **Wall of Champions** — all award winners by year, in a giant chronological table (year | generation | MVL | ROY | etc.)
- **All-time leaderboards** — most MVLs, most attendances, lowest indv round, lowest scramble round, most holed shots, most par-3s, etc.
- **Generation Browser** — pick a year (G XXIII, G XXIV...) and see who attended, what the awards were, all rounds played that trip. Like a yearbook.
- **Hole Difficulty** — across 28 years, which holes are hardest? (uses `Indv Hole Difficulty` data)

#### 3c. New section: `/this-day`
- Each day, show "On this day in Golfapalooza history…" — a randomly-pulled historical award, round, or fun fact. Cycle daily. Add to home page as a small widget.

#### 3d. Active-trip context
- During a live trip, on the round-detail or scoring screens, show a small "Last time we played this hole…" with avg-to-par from history if the same course has been played before.

#### 3e. Search & permalink everything
- Every historical award, round, and trip gets a permalink (`/hall-of-fame/2014`, `/hall-of-fame/awards/mvl/2007`, `/loozers/{id}/lifetime`).

## Technical implementation order

1. **Migration `00113_historical_namespace.sql`** — all the tables above, RLS = public read (no privacy reason to hide history).
2. **Parser library** `src/lib/history/parse-workbook.ts` — pure-data layer that turns the XLSX into typed JS objects. Easy to unit-test against the file.
3. **Reconciliation API + UI** — admin-only, gated behind `is_admin`.
4. **Import API** — transactional, idempotent, returns detailed counts.
5. **Profile-page lifetime stats tab** — first user-visible payoff. Validates that the data is correct end-to-end.
6. **Hall of Fame page** — bigger feature, build incrementally (wall of champions first, leaderboards next, generation browser last).
7. **"This day" widget** — last because it's nostalgia frosting, not load-bearing.

## Risks & mitigations

- **Wrong-person match in reconciliation** — admin reviews every match before any data flows. Reconciliation is a separate explicit step.
- **Spreadsheet has cell-formula references that didn't resolve to values** — `'N/A'`, `'#DIV/0!'` already visible. Parser must whitelist valid types per column and skip / log otherwise.
- **Re-import overwrites manual edits** — once a history row is in production, admin tools should be the editor; the import script should be `ON CONFLICT DO NOTHING` (or `DO UPDATE` only on a `--force` flag).
- **Historical rounds polluting handicap calc** — mitigated by separate tables. The existing `rounds` table is untouched.
- **Loozer name conflicts** (e.g., two `EricKaniecki`s, or someone changed last name) — reconciliation UI flags these for admin review.
- **The XLSX changes in the future** (someone updates GXXIX results post-trip) — reconcile + re-import should be safe to re-run; design the import to be truly idempotent.

## Open questions for you

1. **Awards acronyms** — confirm or correct: MVL, ROY, MELC, BSPITW. Each one needs a display name + tooltip explaining what it is.
2. **Course history** — was Oglebay (or one course) the venue for the entire 1997–2024 history, or did courses change? If courses changed, we need a per-year course mapping (could be a manual admin-input step after import).
3. **"Loozers" who never played** (Y attendance but `0` rounds, `'N/A'` average) — caddies, family, observers? Import them as attendees but not as players?
4. **The fourth column block in `Scramble Rounds`** (cols 64–82) — what does it represent? Same question for the third block (cols 45–63) which has small per-hole values.
5. **Scope of "Hall of Fame" v1** — ship just the Wall of Champions + Lifetime Stats and defer leaderboards / generation browser / "this day" to follow-up issues? (My lean: yes, ship those two first because they're the highest-information density per LOC.)
6. **Public visibility** — should historical data be visible on the unauthed `/spectator` views? (My lean: yes — it's marketing material for prospective Loozers.)

## Acceptance criteria (Phase 1 — Storage + Reconciliation + Profile Lifetime Stats)

- [ ] Migration `00113_historical_namespace.sql` applied
- [ ] `scripts/import-history.mjs --dry-run` parses every sheet without error and writes a JSON preview
- [ ] `/admin/history/reconcile` lists every workbook Loozer with auto/suggested/unmatched buckets and lets admin save matches
- [ ] `/admin/history/import` runs idempotently, reports counts, populates all `historical_*` tables
- [ ] Profile page (own + others') gets a "Lifetime Stats" section showing years attended, awards, indv/scramble averages, hole-in-one count
- [ ] All counts on the profile page reconcile to within ±1 of the workbook's `Summary` sheet
- [ ] Admin can re-run the importer safely (no duplicates)
- [ ] CLAUDE.md updated with the new tables, endpoints, and admin pages

## Acceptance criteria (Phase 2 — Hall of Fame public surface)

- [ ] `/hall-of-fame` page with Wall of Champions table (1997–present, all award columns)
- [ ] All-time leaderboards (most MVLs, most attendances, lowest indv round, lowest scramble round)
- [ ] Generation browser at `/hall-of-fame/[year]` showing attendees + awards + rounds for a given trip
- [ ] Linked from main nav (or from Loozers page)

## Phase 3 — nice-to-haves (separate issues if appetite confirmed)

- "On this day in Golfapalooza history…" widget on home page
- Hole-difficulty heatmap across 28 years
- Yearly recap article auto-generated from history (ties into AI features in [#109](../../issues/109))
- Rivalries: pairwise stats between two Loozers (head-to-head record across all rounds)
- Course-of-the-year photo gallery using existing gallery infrastructure

## Files this issue creates or touches

- `supabase/migrations/00113_historical_namespace.sql` (new)
- `src/lib/history/parse-workbook.ts` (new)
- `src/lib/history/types.ts` (new)
- `src/app/api/admin/history/reconcile/route.ts` (new)
- `src/app/api/admin/history/import/route.ts` (new)
- `src/app/(admin)/admin/history/reconcile/page.tsx` (new)
- `src/app/(admin)/admin/history/import/page.tsx` (new)
- `src/components/admin/HistoryReconciler.tsx` (new)
- `src/components/admin/HistoryImporter.tsx` (new)
- `src/components/profile/LifetimeStats.tsx` (new)
- `src/app/(public)/hall-of-fame/page.tsx` (new — Phase 2)
- `src/components/LoozerProfile.tsx` (modified — add Lifetime tab)
- `scripts/import-history.mjs` (new — wrapper around the parser for terminal dry-runs)
- `CLAUDE.md` (modified — new tables, endpoints, env section if any)

## Estimated effort

- Phase 1: 2–3 sessions of focused work (migration + parser + reconciliation UI + import + profile lifetime stats)
- Phase 2: 2–3 more sessions (Hall of Fame surface, generation browser, leaderboards)
- Phase 3: opportunistic, separate issues

I would not try to do this in a single PR. Phase 1 is a complete deliverable on its own — it gets the data into the DB and shows it on profiles. Phase 2 builds the destination page on top of already-validated data.
