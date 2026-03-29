## Overview

Enable players to score their scramble team's round live from the golf course, hole by hole. One player per team acts as the scorer, entering the team's score after each hole. Scores sync in real-time so other participants and admins can follow along. Even with live scoring, the admin retains full ability to reconcile and update scores after the round against the paper scorecard.

## Problem Statement

Currently, scramble team scores are entered as a single `gross_score` number on the `scramble_teams` table by an admin after the round. There is no hole-by-hole scoring, no live updates from the course, and no way for players to participate in the scoring process. This means no one knows how teams are performing until well after the round is over.

## User Experience

### For the Scorer (on-course)
1. Open the app during their round — see a "Score" button or card on the home page linking to their active round
2. See the scorecard for their team's round, showing all 18 holes with par and handicap
3. After each hole, tap the hole number and enter the team's gross score for that hole
4. The score auto-saves and syncs immediately
5. Can go back and edit a previous hole's score if they made an error
6. See running totals (gross, net, points) update in real-time as scores are entered
7. At the end of the round, tap "Submit Scorecard" to mark the round as complete

### For Other Users (spectators)
- A leaderboard or "Live Scores" view shows all teams' progress in real-time
- Can see which hole each team is on and their current score relative to par
- Scores update live (via polling or real-time subscription)

### For Admins (reconciliation)
- After a round, view all submitted scorecards
- Compare live-entered scores against the paper card
- Edit any hole's score for any team to correct errors
- Mark a scorecard as "Verified" once reconciled
- The final `gross_score` on `scramble_teams` stays in sync with hole-by-hole totals

## Technical Implementation Plan

### Database Schema

#### `scramble_hole_scores`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| team_id | uuid | FK to scramble_teams |
| hole_number | int | 1-18 |
| strokes | int | Team's gross score for this hole |
| entered_by | uuid | FK to users (who entered it) |
| updated_at | timestamptz | Last update time |

**Unique constraint:** `(team_id, hole_number)`

#### Updates to `scramble_teams`
| Column | Type | Description |
|--------|------|-------------|
| scoring_status | text | `not_started`, `in_progress`, `submitted`, `verified` |
| scorer_id | uuid | FK to users — which team member is the designated scorer |
| submitted_at | timestamptz | When the scorer submitted the card |
| verified_at | timestamptz | When admin verified the card |
| verified_by | uuid | Which admin verified it |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scoring/my-round` | Get current user's active round (team, holes, course info) |
| GET | `/api/scoring/scorecard?team_id={id}` | Get full scorecard for a team (all 18 hole scores + course data) |
| PUT | `/api/scoring/hole` | Update a single hole score `{ team_id, hole_number, strokes }` |
| POST | `/api/scoring/submit` | Mark scorecard as submitted `{ team_id }` |
| GET | `/api/scoring/leaderboard?contest_id={id}` | Live leaderboard for a scramble contest |

### UI Components

#### Player: `LiveScorecard.tsx`
- Full 18-hole scorecard grid (or front 9 / back 9 tabs)
- Each hole shows: hole number, par, handicap index, yards
- Tap a hole to enter/edit score — simple number input optimized for one-hand mobile use
- Visual indicators: birdie (green), par (gray), bogey (red), etc.
- Running totals row: front 9, back 9, total, net, points
- "Submit" button when all holes are scored

#### Spectator: `Leaderboard.tsx`
- Ranked list of all teams with current scores
- Shows "thru X" (how many holes completed)
- Points, gross, and net columns
- Auto-refreshes periodically (every 30-60 seconds)

#### Home Page Integration
- When a user is on a team with `scoring_status = 'in_progress'` or `'not_started'`, show a prominent "Score Your Round" card on the home page
- The card shows team name, course, and a "Start Scoring" / "Continue Scoring" button

### Real-Time Considerations

- Use polling (every 30-60 seconds) for the leaderboard rather than WebSockets to keep infrastructure simple
- Score saves are immediate (optimistic UI update + API call)
- The `gross_score` on `scramble_teams` should be auto-computed as the sum of `scramble_hole_scores.strokes` whenever scores change
- If no hole scores exist, fall back to the manually-entered `gross_score` for backward compatibility

## Edge Cases & Considerations

- Only one scorer per team should be designated, but admin can change this
- If a scorer loses connectivity, scores queue locally and sync when back online (PWA offline support, future enhancement)
- Admin can always override any score, even after submission
- The existing `gross_score` field on `scramble_teams` should remain as the source of truth for leaderboard calculations — hole scores compute into it
- Starting hole support: teams with shotgun starts may begin on hole 10; the scorecard should handle this
- 9-hole rounds: some contests may only play 9 holes; the scorecard should adapt
- Scorer can be any team member — admin assigns via the Scramble Manager
- Score entry should be fast — large tap targets, minimal steps per hole

## Acceptance Criteria

- [ ] Database migration adds `scramble_hole_scores` table and new columns to `scramble_teams`
- [ ] Player can open their team's scorecard and enter scores hole by hole
- [ ] Scores save immediately and update the team's `gross_score` total
- [ ] Running totals (gross, net, points) update as scores are entered
- [ ] Player can edit previously entered scores
- [ ] Player can submit the scorecard when all holes are scored
- [ ] Leaderboard view shows all teams ranked by points with "thru X" progress
- [ ] Leaderboard auto-refreshes
- [ ] Home page shows "Score Your Round" card when user has an active round
- [ ] Admin can still enter/edit scores via the existing Scramble Manager
- [ ] Admin verification workflow exists (see admin scoring issue)
