## Schema amendment — per-day scrambles, event-spanning contests, generalized observations

Discussion surfaced a class of contests the original plan didn't cover (BSPITW, 100 Feet!). Decisions below are locked.

### 1. A multi-day scramble = one scramble contest **per day**
A 3-day event is **3** `v2_contests` rows (`contest_type='scramble'`), each with its own teams, participant list, and scores, each linked to that day's schedule item via `schedule_items.activity_id`. This makes per-day attendance natural (leave Friday → you're simply not in Saturday's scramble) and is what lets aggregate contests say "played in *all* scrambles."

Add to `v2_contests`:
- `contest_date DATE` — denormalized from the scramble's schedule item, for per-day grouping/sort in aggregate leaderboards (avoids re-deriving the day).

### 2. Participation is per-contest, gated by the event roster
`v2_contest_participants` is per contest, **seeded** from `v2_event_participants WHERE on_roster` but freely editable per contest. **Invariant (server-enforced):** a contest participant must be `on_roster` for the event. Auto-enroll is additive; removal is guarded (never drop a member holding a team seat). Members-only for now.

### 3. Event-spanning aggregate contests (new class)
BSPITW and 100 Feet! aren't children of one scramble — they aggregate across **all** the event's scramble days.

- Modeled as **event-level** contests: `parent_contest_id = NULL`, `event_id` set. The scorer reads every `contest_type='scramble'` in the event (+ observations) and rolls up.
- `contest_type` enum extended: add `'bspitw'`, `'hundred_feet'`.
- They live in a **Competitions hub** (event-level standings area), not on the daily schedule. Data is entered within each day's scramble; standings roll up in the hub. (Mirrors v1's `/bspitw` and `/hundred-feet` pages.)
- Eligibility is derived, not a separate list — e.g. BSPITW: participated in every scramble.

**BSPITW scoring (port `bspitw-scoring.ts`):** per player = under-par points + on-green + holed-out.
- Under-par uses **Adjusted** team handicap (within a day, the lowest-handicap team shifts to 0; every team plays off the gap). Net = gross − adjHdcp; under-par = max(0, par − net); attributed to each team member. **Never** raw `team_handicap` (see the Scramble Net rule).
- On-green / holed-out come from per-player/hole observations (below).

**100 Feet! scoring (port `hundred_feet`):** per player = sum of hole-18 distance across all scramble days; **lowest total wins**. Same measurement type as CTP, different aggregation.

### 4. Generalized observation store (replaces v1's per-contest tables)
One flexible table instead of `bspitw_bonus_points` + `hundred_feet_scores` + a CTP table:

```
v2_contest_observations
  id           UUID PK
  event_id     UUID NOT NULL → v2_events   ON DELETE CASCADE
  contest_id   UUID NOT NULL → v2_contests ON DELETE CASCADE   -- the scramble DAY it was recorded in
  user_id      UUID NOT NULL → v2_profiles ON DELETE CASCADE
  hole_number  SMALLINT            -- nullable for non-hole metrics
  metric       TEXT NOT NULL CHECK IN ('on_green','holed_out','distance_in')  -- extensible
  value        INTEGER NOT NULL    -- bool as 0/1; distance in inches
  created_at, updated_at
  UNIQUE(contest_id, user_id, hole_number, metric)
```
- **BSPITW** reads `on_green` / `holed_out` across the event's scrambles.
- **100 Feet!** reads `distance_in` on hole 18 across all scramble days, accumulates.
- **CTP** reads `distance_in` on its hole within that day's scramble, closest wins.
Extensible: new metrics don't need new tables.

### Revised `v2_contests.contest_type`
`'scramble','skins','ctp','long_drive','long_putt','bspitw','hundred_feet','ryder_cup','calcutta','cornhole','pickem','other'`

### Impact on sub-phases
- **2a** (schema + scramble core): include `v2_contest_observations` and `contest_date` now, so the shape is final. Scramble core itself unchanged.
- **2b** (side contests): now covers **derived** (skins), **manual single-day** (CTP/LD/LP), and lays groundwork for observations.
- **New 2c'** (or fold into 2d): **Competitions hub** + the two event-spanning scorers (BSPITW, 100 Feet!), reading observations + scramble scores across days.
- Tee-time projection + payouts unchanged (2c/2e).
