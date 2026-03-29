## Overview

Enable admins to enter and reconcile final scores from paper scorecards that are handed in after each round. This is the authoritative scoring path — even when live scoring is used, the admin must be able to review, correct, and verify every team's hole-by-hole scores against the physical paper card.

## Problem Statement

Currently, admins can only enter a single `gross_score` number per scramble team via the Scramble Manager. There is no hole-by-hole entry, no verification workflow, and no way to reconcile live-entered scores against the paper cards that teams hand in after their round. The admin needs a purpose-built interface for fast, accurate score entry from paper cards.

## User Experience

### Score Entry from Paper Cards
1. Admin navigates to the scoring section for a specific scramble contest day
2. Sees all teams listed, each showing their current scoring status: `not_started`, `in_progress`, `submitted`, `verified`
3. Taps a team to open its full 18-hole scorecard
4. Enters (or corrects) the score for each hole, reading from the paper card
5. The interface is optimized for speed — tab/swipe between holes, large number inputs
6. Gross total, net total, and points auto-calculate as scores are entered
7. When done with a card, marks the team's scorecard as "Verified"
8. A visual summary shows how many teams are verified vs. still pending

### Reconciliation with Live Scores
- If a team used live scoring, their hole-by-hole scores are already populated
- Admin sees both the live-entered scores and can compare against the paper card
- Any discrepancies can be edited inline — the admin's entry overrides the live data
- Changed holes are visually flagged so it's clear what was modified
- Once reconciled, admin marks the card as "Verified"

### Bulk Operations
- Admin can view the leaderboard at any point to see current standings
- "Verify All" option when all scores match (batch verification)
- Ability to reopen a verified scorecard if an error is discovered later

## Technical Implementation Plan

### Database Schema

This feature shares the `scramble_hole_scores` table from the live scoring feature:

#### `scramble_hole_scores` (shared with live scoring)
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to scramble_teams |
| hole_number | int | 1-18 |
| strokes | int | Team's gross score for this hole |
| entered_by | uuid | FK to users (who entered/last edited it) |
| updated_at | timestamptz | Last update time |

#### Updates to `scramble_teams` (shared with live scoring)
| Column | Type | Description |
|--------|------|-------------|
| scoring_status | text | `not_started`, `in_progress`, `submitted`, `verified` |
| verified_at | timestamptz | When admin verified the card |
| verified_by | uuid | Which admin verified it |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/scoring/teams?contest_id={id}` | All teams with scoring status and hole scores |
| PUT | `/api/admin/scoring/hole` | Admin enters/updates a hole score `{ team_id, hole_number, strokes }` |
| PUT | `/api/admin/scoring/bulk` | Admin enters multiple hole scores at once `{ team_id, scores: [{hole_number, strokes}] }` |
| POST | `/api/admin/scoring/verify` | Mark a team's scorecard as verified `{ team_id }` |
| POST | `/api/admin/scoring/unverify` | Reopen a verified scorecard `{ team_id }` |
| GET | `/api/admin/scoring/summary?contest_id={id}` | Contest summary: verified count, total teams, leaderboard |

### UI Components

#### Admin: `AdminScorecardEntry.tsx`
- Full 18-hole scorecard grid for a single team
- Shows hole number, par, handicap, and score input for each hole
- Number inputs optimized for rapid entry (stepper or direct input)
- Auto-advancing: after entering a score, focus moves to the next hole
- Running totals: front 9, back 9, gross total, handicap, net total, points
- Color coding: birdies (green), pars (gray), bogeys (yellow), doubles+ (red)
- If live scores exist, show them pre-filled; highlight any holes the admin changes
- "Verify" button at the bottom

#### Admin: `ScoringDashboard.tsx`
- List of all teams for the selected contest day
- Each team row shows: team members (avatar pills), scoring status badge, gross score, points
- Status badges: "Not Started" (gray), "In Progress" (amber), "Submitted" (blue), "Verified" (green)
- Filter by status (e.g., show only unverified)
- Tap a team to open `AdminScorecardEntry`
- Summary bar at the top: "X of Y teams verified"

#### Integration with Existing `ScrambleManager.tsx`
- The existing gross score input field on the Scramble Manager should remain for quick overrides
- Add a "Scorecard" button next to each team that opens the hole-by-hole entry view
- When hole scores exist, the gross score field becomes read-only (computed from holes)

## Edge Cases & Considerations

- **No course holes data:** If the course's hole-by-hole par/handicap data isn't loaded, the admin should still be able to enter scores (just without par reference)
- **Partial entry:** Admin should be able to save partial scorecards (e.g., enter front 9 now, back 9 later)
- **Conflicting edits:** If a player is still live-scoring while admin is reconciling, the admin's entry takes precedence; admin should see a warning if the team hasn't submitted yet
- **Recomputation:** Whenever hole scores change, `scramble_teams.gross_score` must be recomputed as the sum; points recalculate automatically
- **Multiple contest days:** The dashboard should make it easy to switch between Day 2, Day 3, and Day 4 scramble contests
- **Backward compatibility:** Teams that only have a `gross_score` (no hole scores) should continue to work as they do today
- **Audit trail:** Track who last edited each hole score and when

## Acceptance Criteria

- [ ] Admin can open a scorecard entry view for any scramble team
- [ ] Admin can enter scores hole-by-hole with auto-advancing focus
- [ ] Running totals (gross, net, points) update as scores are entered
- [ ] Gross score on `scramble_teams` auto-updates from hole scores
- [ ] Admin can see pre-filled live scores and edit any discrepancies
- [ ] Changed holes are visually flagged
- [ ] Admin can mark a scorecard as "Verified"
- [ ] Admin can reopen a verified scorecard
- [ ] Scoring dashboard shows all teams with status badges and progress
- [ ] Dashboard shows summary of verified vs. pending teams
- [ ] Existing ScrambleManager gross score input continues to work for quick overrides
- [ ] All score edits include audit trail (who edited, when)
