## Overview

Support "composition tees" — hybrid tee boxes that combine holes from two or more existing tee boxes. For example, a "Black/Blue" tee might play holes 1, 3, 7 from Black and the rest from Blue. The course publishes its own rating and slope for the combination.

## Data Model

### `course_tees` — no changes needed
A composition tee is just another row in `course_tees` with its own name, color, rating, slope, and par. Nothing structurally different.

### New table: `composition_tee_mappings`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tee_id | UUID FK → course_tees | The composition tee |
| hole_number | SMALLINT (1-18) | |
| source_tee_id | UUID FK → course_tees | Which tee box this hole plays from |
| UNIQUE | (tee_id, hole_number) | One mapping per hole |

When this table has entries for a tee, that tee is treated as a composition tee. When the app needs hole data (yards, par, handicap index, GPS coords) for a composition tee, it looks up the source tee for each hole and reads from that source tee's `course_holes` row.

**No `course_holes` rows are created for composition tees.** The data is always resolved from the source tees, so it stays in sync automatically.

### How resolution works

```
To get hole 5 data for "Black/Blue" tee:
1. Check composition_tee_mappings for tee_id = "Black/Blue", hole_number = 5
2. Find source_tee_id = "Black"
3. Read course_holes WHERE tee_id = "Black" AND hole_number = 5
4. Return that data (yards, par, handicap_index, GPS coords, etc.)
```

## Admin UI

### Creating a composition tee
1. Admin creates a new tee box normally (name: "Black/Blue", color, rating, slope, par)
2. A new toggle or indicator marks it as a composition tee
3. An editor opens showing all 18 holes with a dropdown per hole
4. Each dropdown lists the other tee boxes for this course
5. Admin selects which source tee each hole plays from
6. Save creates the 18 `composition_tee_mappings` rows

### Editing
- Change any hole's source tee via the same dropdown interface
- The composition tee's rating/slope/par are edited normally on the tee itself

### Visual indicator
- In the tee list, composition tees show a small badge or icon indicating they're hybrid
- The hole list for a composition tee shows the source tee name for each hole (e.g., "Black" or "Blue")

## User-facing behavior
- Composition tees appear in tee selection just like any other tee
- When scoring a round on a composition tee, hole data (yards, par, map) resolves from the mapped source tees
- Players don't need to know it's a composition — it just works

## Where resolution is needed
- Round creation (selecting a tee for scoring)
- Live scoring (hole info display: par, yards, map)
- Round detail page (scorecard display)
- Handicap calculation (course rating/slope comes from the composition tee itself)
- Scramble scoring (contest tee assignments)

## Acceptance Criteria
- [ ] Admin can create a composition tee with per-hole source tee selection
- [ ] Composition tee hole data resolves from source tees (no duplication)
- [ ] Changes to source tee holes automatically reflect in the composition tee
- [ ] Composition tee has its own rating, slope, and par
- [ ] Composition tees appear in all tee selection dropdowns
- [ ] Live scoring shows correct per-hole data (yards, par, map) from source tees
- [ ] Visual indicator in admin distinguishes composition tees from regular tees
