## Overview

Implement automatic USGA World Handicap System (WHS) calculation based on rounds logged in My Rounds, and add a standardized team handicap formula for 4-person scramble contests.

The calculation logic (`src/lib/golf/calculator.ts`) and data model (`player_handicaps`, `handicap_history`, `round_players.score_differential`) already exist but are not wired together. This issue covers closing the gaps to make handicap tracking fully automatic.

## What Already Exists

- **Differential formula** — `calculateDifferential()` in `src/lib/golf/calculator.ts`
- **WHS lookup table** — correct 3-to-20+ round bracket with adjustment values
- **Net Double Bogey** — `calculateMaxScore()` and `calculateAdjustedGrossScore()` implemented
- **Course/tee ratings** — `course_rating`, `slope_rating`, and per-hole `handicap_index` all captured
- **Database tables** — `player_handicaps` (current index), `handicap_history` (audit log), `round_players.score_differential` (per-round)
- **Score differential** — already computed and stored when a round is created via the API

## What's Missing

### 1. Adjusted Gross Score on Round Save

When a round is completed, the API should:
- Apply Net Double Bogey cap to each hole: `max_score = par + 2 + strokes_received`
- Sum the adjusted scores into `round_players.final_adjusted_score`
- Recalculate the differential from the adjusted gross (not raw gross)

Currently `final_adjusted_score` exists in the schema but is never populated.

### 2. Automatic Handicap Recalculation

After a round is completed, trigger a handicap recalculation:
1. Fetch the player's most recent 20 valid score differentials
2. Apply the WHS lookup table (best N of 20, with adjustment for < 6 rounds)
3. **Truncate** (not round) to one decimal place
4. Update `player_handicaps` with the new index
5. Log to `handicap_history` with the differentials used

This could be an API endpoint (`POST /api/handicap/calculate`) called after round completion, or inline in the round completion flow.

### 3. Soft Cap and Hard Cap

Compare the new Handicap Index against the player's **Low Handicap Index** (lowest in the past 12 months, already tracked in `player_handicaps.low_handicap_index`):

- **Soft Cap**: If new HI exceeds Low HI by more than 3.0, reduce the excess by 50%
- **Hard Cap**: New HI can never exceed Low HI + 5.0
- **Maximum**: Cap at 54.0

### 4. Nine-Hole Round Pairing

The app supports `9-front` and `9-back` round types. WHS requires pairing two 9-hole rounds into a single 18-hole composite differential:

- Calculate each 9-hole differential using the 9-hole course rating and slope (already stored as `front_course_rating`, `front_slope_rating`, etc. on `course_tees`)
- Pair chronologically: combine the two most recent unpaired 9-hole differentials (`combined_differential = diff1 + diff2`)
- Unpaired 9-hole scores wait until a second 9-hole round is posted
- Need a way to track pairing status (e.g., a `paired_with_round_id` column on `round_players`, or a separate pairing table)

### 5. Playing Conditions Calculation (PCC)

**Skip this.** PCC requires a statistically significant sample of scores from many players at the same course on the same day. A 20-person golf trip doesn't generate enough data. Set PCC adjustment to 0.

### 6. Handicap Display

- Show the player's current Handicap Index on their profile page (already has a field for this)
- Show handicap on the My Rounds page
- Consider a dedicated `/handicap` page showing index history, recent differentials, and which rounds were used

## Scramble Team Handicap

The USGA does not publish an official scramble handicap formula. The most widely used tournament formula is the **weighted A-B-C-D method**:

```
Team Handicap = 0.20(A) + 0.15(B) + 0.10(C) + 0.05(D)
```

Where A = lowest Course Handicap through D = highest Course Handicap.

This weights the best player most heavily (they contribute the most shots in a scramble) and totals 50% of the combined handicaps.

### Implementation

- Calculate each player's **Course Handicap** first: `HI x (Slope / 113) + (Course Rating - Par)`
- Sort lowest to highest, apply the 20/15/10/5 weights
- Round the result to the nearest whole number
- Apply as strokes allocated using the course's hole handicap allocation (stroke index)
- Display on scorecards and leaderboards as "Team HCP"

### Where This Fits

- `ScrambleManager` or contest setup — auto-calculate team handicap when teams are formed
- `ScoringManager` / scorecard display — show team handicap and net scores
- Leaderboard — support gross and net standings

## Edge Cases

- Player has no handicap (fewer than 3 rounds logged) — team handicap uses 0 for that player, or exclude from net scoring
- Player hasn't logged rounds in the app but has a known handicap — allow manual handicap override on their profile
- Course missing ratings — flag these rounds as ineligible for handicap calculation
- Multiple rounds on the same day — all count, processed chronologically

## Acceptance Criteria

- [ ] Completing a round in My Rounds automatically calculates adjusted gross score and differential
- [ ] Handicap Index is recalculated after each completed round using the WHS sliding window
- [ ] Soft cap and hard cap are applied against the 12-month low index
- [ ] Nine-hole rounds are paired chronologically into composite differentials
- [ ] Handicap Index displays on the user's profile
- [ ] Scramble team handicap is calculated using the 20/15/10/5 weighted formula
- [ ] Scramble scorecards and leaderboards show team handicap and net scores
- [ ] Manual handicap override is available for players without enough logged rounds
