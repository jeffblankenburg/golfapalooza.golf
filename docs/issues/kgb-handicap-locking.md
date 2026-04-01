## Overview

Should we "lock" (snapshot) each player's handicap at the start of a KGB Cup event, or continue using their live `handicap_index` from the `player_handicaps` table? Additionally, should we use the raw handicap index directly, or compute a **Course Handicap** specific to the course being played?

## Current State

### Existing Tables

**`player_handicaps`** — Live handicap data, updated as rounds are completed:
- `user_id`, `handicap_index` (DECIMAL 3,1), `low_handicap_index`, `rounds_used`, `last_calculated_at`

**`kgb_cup_player_handicaps`** — Snapshot table (exists but currently unused):
- `contest_id`, `player_id`, `original_handicap` (NUMERIC 4,1), `adjusted_handicap` (SMALLINT)
- Unique on `(contest_id, player_id)`
- Has a POST endpoint at `/api/admin/kgb-cup/handicaps` that snapshots handicaps and computes adjusted values

**`kgb_cup_pair_handicaps`** — Admin-assigned scramble handicaps for Section 3:
- `contest_id`, `pair_id`, `scramble_handicap` (SMALLINT)

**`course_tees`** — Course rating data needed for Course Handicap calculation:
- `course_rating` (DECIMAL 4,1), `slope_rating` (INTEGER 55-155), `par`

### Current Behavior

Both the **admin scoring manager** (`KgbCupScoringManager.tsx`) and the **live scoring page** (`/kgb-cup/scoring/page.tsx`) compute handicaps on-the-fly:

1. Fetch each player's current `handicap_index` from `player_handicaps`
2. For each foursome, subtract the lowest handicap in the group
3. Use the resulting adjusted value for stroke allocation

The snapshot table `kgb_cup_player_handicaps` and its POST endpoint exist but are **not currently used** by either scoring flow. If a player's handicap changes between when pairings are made and when the event is played, the scoring pages will silently use the new value.

### Snapshot Mechanism (Already Built)

`POST /api/admin/kgb-cup/handicaps` already:
1. Reads all participants' current `handicap_index` from `player_handicaps`
2. Calls `computeAdjustedHandicaps()` (subtracts lowest across all participants)
3. Upserts into `kgb_cup_player_handicaps` with `original_handicap` and `adjusted_handicap`

**Note:** The snapshot API subtracts the lowest across *all* contest participants, while the live flows subtract the lowest within *each foursome*. This is a discrepancy that would need to be reconciled.

## What Would "Locking" Require?

### Option A: Use the existing snapshot table

1. **Admin triggers snapshot** via existing POST endpoint (or auto-trigger when scoring opens)
2. **Fix the adjustment scope** — snapshot should compute per-foursome adjustments (not contest-wide), matching the current live behavior
3. **Update scoring flows** to read from `kgb_cup_player_handicaps` instead of computing on-the-fly from `player_handicaps`
4. **Admin override** — the PUT endpoint already supports overriding individual player handicaps in the snapshot table

This is minimal work since the table and API already exist.

### Option B: No locking (current behavior)

Continue computing on-the-fly from `player_handicaps`. Accept that handicaps could shift if a player's handicap is recalculated between setup and play. The `kgb_cup_player_handicaps` table would remain unused (or could be removed).

## Course Handicap Question

Currently, the raw `handicap_index` (adjusted by subtracting the lowest in the foursome) is used directly for stroke allocation via `getStrokesOnHole()`. This distributes strokes to the hardest holes based on `course_holes.handicap_index`.

The USGA formula for **Course Handicap** is:

```
Course Handicap = Handicap Index × (Slope Rating / 113) + (Course Rating - Par)
```

We have all the data needed (`course_tees.slope_rating`, `course_tees.course_rating`, `course_tees.par`), but we'd need to know which tee each player is playing from. The `contest_hole_tees` table assigns tees per hole per contest, but players in the same foursome could theoretically play different tees.

### Implications

- Using raw `handicap_index`: Simpler, but doesn't account for course difficulty. A 10-handicap gets the same strokes whether playing a 120-slope course or a 145-slope course.
- Using Course Handicap: More accurate per USGA rules, but adds complexity around tee selection. For our use case (everyone likely plays the same tees), this could be straightforward.

## Decision Points

1. **Lock or live?** — Should handicaps be snapshotted before the event starts?
2. **Raw index or Course Handicap?** — Should we factor in slope/rating for the specific course?
3. **If locking + Course Handicap:** Should the snapshot store the computed Course Handicap rather than the raw index?
