## Overview

Scrambles at Golfapalooza are played across **mixed tee boxes** — a typical day is 6 holes from the reds, 6 from the yellows, and 6 from the whites. Each hole in `course_holes` has a stock `handicap_index` (1–18 difficulty rank) that's correct only when a round is played from a single tee. When tees are mixed, that ranking is wrong: Hole 15 at Alpine Lake is a grueling par-5 from the whites (a #2-hardest hole) but an easy, birdie-able par-5 from the reds — its effective difficulty within a mixed round can't come from either single-tee ranking.

We need to let admins override the per-hole handicap index for a specific scramble contest, based on the group's years of historical scoring data. The override lives on the existing tee-assignment row (one row per hole per contest) and takes effect only when all 18 holes have an override.

## User Experience

### Admin entry

1. On `/admin/events/{tripId}/scrambles` → the Setup accordion already renders a per-hole row with a hole number, tee-color buttons, and par/yards summary.
2. Next to the par/yards column, a small numeric text input accepts a manual handicap index (1–18). The placeholder shows the stock `handicap_index` for the currently selected tee so the admin can see what they're replacing.
3. Changes use the existing 500 ms debounced batch save — no separate save button.
4. A banner summarizes state:
   - **All 18 set** (green): "Scoring will use overrides instead of stock hole difficulty."
   - **Partial** (amber): "N of 18 overrides set. Scoring ignores partial overrides — fill all 18 to activate, or clear them all to fall back to stock."

### Scoring

- When all 18 overrides are present, **stroke distribution** (for scramble leaderboard tiebreakers, skins, and the live scoring shell) uses the override values instead of `course_holes.handicap_index`.
- When any override is missing, the system falls back entirely to stock — partial overrides are never mixed with stock.
- Single-tee rounds (Ryder Cup) continue to use stock `handicap_index` unchanged; this feature is scramble-specific.

## Technical Implementation

### Schema

New column on existing `contest_hole_tees`:

```sql
ALTER TABLE contest_hole_tees
  ADD COLUMN handicap_index_override SMALLINT,
  ADD CONSTRAINT contest_hole_tees_handicap_override_range
    CHECK (handicap_index_override IS NULL OR handicap_index_override BETWEEN 1 AND 18);
```

Migration: `supabase/migrations/00110_hole_handicap_override.sql`.

### API

- `GET /api/admin/contest-tees?contest_id=...` returns `handicap_index_override` per assignment.
- `PUT /api/admin/contest-tees` accepts `handicap_index_override` per row in the `assignments` array (nullable).

### Consumers updated

Every scramble consumer that reads `course_holes.handicap_index` now checks "all 18 overridden?" first:

- `src/lib/winners/scramble.ts` — `breakScrambleTie()`
- `src/app/api/skins/route.ts` — per-hole skins net-score ranking
- `src/app/api/scorecards/route.ts` — scorecard display
- `src/app/(app)/scoring/page.tsx` — live scoring page hands the correct handicap_index to `LiveScorer`

### UI

- `src/components/admin/ContestTeeAssigner.tsx` — new override input per row + all-or-nothing banner. Uses existing debounced batch save.

### Not in scope

- KGB Cup scoring (single-tee, stock handicap_index is correct).
- Per-player handicap overrides (that's a separate concept — player-level handicap, not hole-level difficulty).
- Any UI for bulk CSV import — admin types the 18 values directly.

## Acceptance Criteria

- [ ] Admin can enter a 1–18 handicap override on each hole row of the Setup accordion
- [ ] Placeholder shows the stock handicap_index from the currently selected tee
- [ ] 500 ms debounced save persists overrides alongside tee changes
- [ ] Banner tells admin whether overrides are active (all 18 filled) or ignored (partial)
- [ ] Scramble tiebreakers use override ordering when active
- [ ] Skins per-hole net calculations use override ordering when active
- [ ] Live scoring scorecard distributes team strokes using override handicap_index when active
- [ ] Partial overrides fall back cleanly to stock without breaking anything
- [ ] KGB Cup (single-tee) is unaffected
