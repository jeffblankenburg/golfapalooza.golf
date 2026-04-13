## Overview

Aggregate player performance data across all trips to build career statistics and year-over-year comparisons. The data already exists in archived trips — this feature surfaces it in a meaningful way.

## User Experience

### On the Loozer Profile Page

A "Career Stats" section showing:

**Scramble Stats (across all trips):**
- Trips attended (with years)
- Total scramble rounds played
- Best scramble score (team gross)
- Average scramble score
- Best net score
- Eight-bag average (already tracked per-trip in `scramble_player_stats`)

**KGB Cup Stats:**
- Overall match record (W-L-T across all sections)
- Section breakdown (individual match play, partner match play, scramble)
- Best single-event record

**Contest Wins:**
- Total skins won (count + total $)
- Daily game wins (CTP, Long Drive, Long Putt)
- Closest to 100 Feet wins
- Cornhole titles (singles + doubles)

**Calcutta:**
- Total Calcutta winnings across all years
- Best single-year ROI
- Teams owned (history)

**Awards:**
- All awards/accolades won, with year (from the awards system)

### On a Dedicated Career Page (optional)

A `/career` or `/stats` page that shows:
- Leaderboards across all years (most skins, most awards, best scramble avg, etc.)
- Year-by-year comparison charts
- "Hall of Fame" style records

## Data Sources

All data already exists across archived trips:

| Stat | Source Table(s) |
|------|----------------|
| Scramble scores | `scramble_teams` + `scramble_team_members` |
| KGB Cup matches | `kgb_cup_hole_scores` + foursomes/pairs |
| Skins | `skins_winners` |
| Daily games | `daily_winners` |
| 100 Feet | `hundred_feet_results` |
| Cornhole | `cornhole_matches` |
| Calcutta | `calcutta_ownership` + `contest_winners` |
| Accolades | `accolades` |
| Trip attendance | `event_participants` |
| Eight-bag avg | `scramble_player_stats` |

## Implementation Approach

### Option A: Query on demand
- Profile page queries across all trips when loaded
- Simpler but potentially slow with many years of data

### Option B: Materialized stats table (recommended)
- Create a `player_career_stats` table (or JSONB column on `users`)
- Recalculate when trips are archived or on-demand via admin button
- Fast reads, occasional writes

### API

- `GET /api/career-stats?user_id={id}` — returns aggregated career stats
- `POST /api/admin/career-stats/recalculate` — admin trigger to rebuild stats

## Acceptance Criteria

- [ ] Loozer profile shows career stats aggregated across all trips
- [ ] Stats include scramble, KGB Cup, skins, daily games, Calcutta, and awards
- [ ] Year-by-year breakdown is available
- [ ] Stats update when a trip is archived
- [ ] Career records/leaderboards are visible (most skins, most awards, etc.)
