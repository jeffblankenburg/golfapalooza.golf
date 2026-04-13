## Overview

Replace the current flat `accolades` table with a two-layer awards system: **persistent award definitions** that span all years, and **per-trip winners** assigned to those awards. This mirrors the legacy system at golfapalooza.com.

## Problem

The current `accolades` table is just `(trip_id, title, user_id)` — a flat list of "Jeff won X in 2025." There's no concept of:
- A persistent award that exists every year (e.g., "Most Valuable Loozer" est. 1997)
- What the winner receives (trophy, jacket, etc.)
- What the award is for (description/criteria)
- Historical winners across years
- Awards that can have multiple winners (e.g., "Day 1 Scramble Winners" = entire team)

## Data Model

### `awards` (persistent definitions)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(200) | "Most Valuable Loozer", "The Green Jacket", etc. |
| description | TEXT | What the award is for |
| prize | VARCHAR(200) | What the winner gets: "Trophy", "Jacket", "Trophy and a Boner" |
| established_year | SMALLINT | Year the award was created (e.g., 1997) |
| sort_order | SMALLINT | Display order |
| is_active | BOOLEAN | Can be retired without deleting history |
| created_at | TIMESTAMPTZ | |

Note: awards are NOT tied to a trip — they span all trips.

### `award_winners` (per-trip assignments)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| award_id | UUID FK → awards | |
| trip_id | UUID FK → trip_settings | Which year/trip |
| user_id | UUID FK → users | The winner |
| created_at | TIMESTAMPTZ | |
| UNIQUE | (award_id, trip_id, user_id) | Prevent duplicates |

Multiple winners per award per trip are supported (e.g., 4 scramble team members all win "Day 1 Scramble").

### Migration from `accolades`

The existing `accolades` data can be preserved alongside the new system, or migrated:
- Each unique accolade title becomes an `awards` row
- Each `accolades` row becomes an `award_winners` row
- Keep the old table until migration is verified

## Awards from Legacy System

Based on the legacy app, these awards should be seeded:

| Award | Est. | Description | Prize |
|-------|------|-------------|-------|
| Most Valuable Loozer | 1997 | MVP of Golfapalooza | |
| Best Scramble Partner in the World | 2016 | Tournament Winner | |
| Rookie of the Year | 2001 | | Cup |
| The Green Jacket | 2001 | Jacket Worn by Last Place on Saturday Night | |
| King of Corn | 2005 | Winner of the Cornhole Tournament | |
| Douche of the Year | 2010 | The year's biggest douche | |
| Day 1: 4 Man Scramble | 2016 | Round 1 Winners | |
| Day 2: 4 Man Scramble | 2016 | Round 2 Winners | |
| Day 3: 4 Man Scramble | 2016 | Round 3 Winners | |
| Best Line | 1997 | Best Quote from an Attending Golfer | Trophy |
| The Squib | 2001 | | Trophy |
| Cornhole Doubles Champions | 2008 | Winners of Cornhole Doubles Tournament | |
| The Most Improved | 2001 | | Trophy |
| JT Thomas Award | 2003 | Given to the golfer whose game gets worse the most from year to year | |
| MELC Championship | 2001 | Tournament Winner | |
| Individual Medalist | 1997 | Lowest raw score | |
| Two Man Scramble | 1997 | | Two Trophies |
| The Johnson | 2001 | Who has the biggest, uhhh, you know...driver | |
| Four Man Best Ball | 1997 | | Four Trophies |
| Two Man Best Ball | 1997 | | Two Trophies |
| The Dosky Award | 2001 | | Trophy and a Boner |
| Four-Man Scramble | 2004 | Winner of the 4 man 18-hole scramble | |
| On Tour Championship | 2007 | Most Improved Player from Last Year | |

## Admin UI

### Global Awards Management (on main admin page, not per-trip)

- List all awards with name, established year, description, prize, active status
- Add/edit/delete awards
- Reorder via sort_order
- Toggle active/inactive

### Per-Trip Winner Assignment (on event detail page)

- Replace or augment the current AccoladesManager
- Show all active awards in a list
- For each award, show current winner(s) or "Not yet assigned"
- Tap to assign winner(s) — player picker (multi-select for team awards)
- Remove winner assignment

## Player-Facing UI

### Awards Page (`/awards` or integrated into `/info`)

**Current Trip:**
- List of all awards with this year's winners (or "TBD")
- Grouped or sorted by category if desired

**Hall of Fame / History:**
- For each award, show all historical winners by year
- Tap an award to see its full history
- Tap a player to see all their awards (links to profile)

### On Loozer Profile

- "Awards" section listing all awards won, with year
- Links to the award detail

## Acceptance Criteria

- [ ] Admin can create, edit, and retire persistent award definitions
- [ ] Admin can assign one or more winners to each award per trip
- [ ] Awards display established year, description, and prize
- [ ] Player-facing page shows current year's awards and historical winners
- [ ] Loozer profile shows all awards won across all years
- [ ] Legacy accolades data is preserved or migrated
- [ ] Multiple winners per award per trip are supported (team awards)
