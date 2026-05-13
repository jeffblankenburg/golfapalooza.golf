# Proper WHS support for 9-hole rounds in handicap calculation

## Problem

The USGA World Handicap System recognizes 9-hole rounds as legitimate handicap-bearing scores. A 9-hole score becomes an 18-hole-equivalent differential by either (a) being paired with the player's expected 9-hole score for the unplayed half, or (b) being combined with a second 9-hole differential into a true 18-hole differential.

Today, `course_tees` stores only 18-hole `course_rating`, `slope_rating`, and `par`. Computing a differential from a 9-hole score against those values produces a wildly wrong result — a 49 on a Par-36 9-hole stretch becomes ~−20 differential when fed through `(113 / slope_18) × (49 − rating_18)`, which then craters the player's index.

**Current stop-gap (already shipped):** 9-hole rounds and partial 18-hole rounds no longer write a `score_differential`. They're filtered out of `recalculateHandicap` and the score-to-par display uses the played holes' par sum. A cleanup script (`scripts/cleanup-9hole-differentials.mjs`) was run to undo the historical damage.

## Goal

Re-enable 9-hole rounds as full handicap-bearing scores per WHS rules, without distorting existing 18-hole math.

## Approach

### 1. Schema

Extend `course_tees` with optional 9-hole rating/slope:

```sql
ALTER TABLE course_tees
  ADD COLUMN course_rating_front NUMERIC(4,1),
  ADD COLUMN slope_rating_front INT,
  ADD COLUMN course_rating_back NUMERIC(4,1),
  ADD COLUMN slope_rating_back INT;
```

These are nullable — a course that hasn't published 9-hole ratings still works for 18-hole rounds, just not for 9-hole handicap.

### 2. Differential math

For a 9-hole round of type `9-front` / `9-back`, compute the differential against the matching 9-hole rating/slope:

```
diff_9 = (113 / slope_9) × (AGS_9 − rating_9)
```

This yields a "9-hole differential" — roughly half an 18-hole differential.

### 3. Pairing into 18-hole equivalents

Per WHS, two 9-hole differentials combine into one 18-hole differential by summing. The simplest implementation pairs each 9-hole round with the player's *expected* 9-hole score (driven by their current index), but the cleanest UX is **pair-the-next-9-hole-round-the-player-posts**:

- A 9-hole round is stored with a 9-hole differential.
- `recalculateHandicap` walks the user's 9-hole differentials chronologically, pairs them up (front+back, or two of the same side, doesn't matter for WHS), and adds the *sum* to the player's 18-hole differential pool.
- Any unpaired 9-hole round at the tail is held out — it'll get paired by the next 9-hole round, or paired against the player's expected differential after some configurable window (90 days per WHS).

Edge case: a player who *only* posts 9-hole rounds. WHS says after 14 days a stray 9-hole round gets paired with the player's expected differential. That math requires knowing their handicap to compute expected, which means we'd need a two-pass calc. Defer or implement carefully.

### 4. Data entry

- Course-edit UI gains 9-hole rating/slope inputs alongside the existing 18-hole fields.
- Course lookup cascade (GCAPI / AI) needs to capture 9-hole ratings where the source provides them. GCAPI publishes them on most courses; the AI scorecard lookup will need its prompt updated.
- Backfill plan: pull 9-hole ratings from GCAPI for every existing course; admin verifies before they go live.

### 5. UI

- `/my-rounds` round list: 9-hole rounds get the same "Diff X.X" row, marked with a "(9)" suffix or similar.
- Handicap dashboard at `/handicap`: shows mixed 18- and 9-hole rounds in the rotation, with a note when 9-hole rounds are paired.

## Out of scope

- Combined-9 from two different courses — WHS allows this; pair-by-date naturally handles it.
- Tournament vs. casual round types — separate concern.
- Match play / Stableford adjustments — separate concern.

## Acceptance criteria

- [ ] Migration adds nullable 9-hole rating/slope columns.
- [ ] Course-edit UI lets admins set 9-hole ratings; lookup cascade captures them when available.
- [ ] `/api/rounds` POST and PUT write a 9-hole-eligible differential when the source course has 9-hole ratings and the round_type is 9-front / 9-back.
- [ ] `recalculateHandicap` pairs 9-hole differentials chronologically and feeds the resulting 18-hole-equivalent into the WHS table.
- [ ] No regression for existing 18-hole rounds — same indexes before/after migration on a sample of users.
