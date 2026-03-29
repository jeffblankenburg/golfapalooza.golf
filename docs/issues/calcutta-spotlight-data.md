# Feature: Calcutta Spotlight - Player Data for Auction Display

## Overview

The Calcutta auction display (`/calcutta-display`) shows a spotlight view for each participant as they come up for auction. This screen is projected on a 10' widescreen for ~40 people. The spotlight needs to show key information about each player so bidders can make informed decisions.

## Current State

The spotlight currently shows:
- Player avatar and display name (large pill format)
- Age
- Auction order position
- Scramble team partners (from contest_participants)
- Past accolades/wins

## Required Data Points

The following data needs to be available and displayed on the spotlight screen for each participant:

### 1. 40-Yard Dash Speed
- **Status:** Not yet built
- **Description:** Each participant runs a timed 40-yard dash during the event. The time (in seconds) should be recorded and displayed on the spotlight.
- **Needs:** A way to record 40-yard dash times per participant per trip. Display the time prominently (e.g., "4.82s").
- **Database:** New field or table to store athletic challenge results per participant per trip.

### 2. Standing Jump Height
- **Status:** Not yet built
- **Description:** Each participant does a standing vertical jump. The height (in inches) should be recorded and displayed.
- **Needs:** A way to record standing jump heights per participant per trip. Display as height (e.g., "24 inches").
- **Database:** Same table/structure as 40-yard dash — a general "athletic challenges" results system.

### 3. Thursday Scramble Team & Score
- **Status:** Partially built (team partners exist, scoring system not built)
- **Description:** Show the participant's Thursday scramble team partners AND their score. The score includes the raw scramble score plus "extra points" (bonus/penalty system TBD).
- **Needs:**
  - Thursday scramble team partners (already available via contest_participants)
  - Scramble scoring system with extra points
  - Display: team names + combined score
- **Depends on:** Scramble scoring and extra points systems being built

### 4. Friday Scramble Partners
- **Status:** Built (available via spotlight.teamPartners)
- **Description:** Show who the participant is teamed with for the Friday scramble.
- **Display:** Already showing in the metadata grid via teamPartners data.

### 5. Singles Cornhole Participation
- **Status:** Not yet displayed
- **Description:** Show whether this participant has signed up / is entered in the Singles Cornhole tournament.
- **Needs:** Query contest_participants for the cornhole_singles contest and check if this user is a participant.
- **Display:** Badge or indicator (e.g., "Singles Cornhole: IN" or just a badge if they're in).

### 6. Doubles Cornhole Partner
- **Status:** Not yet displayed
- **Description:** Show who this participant's Doubles Cornhole partner is.
- **Needs:** Query contest_participants for the cornhole_doubles contest, find this user's team, and display the partner name.
- **Display:** Partner name (e.g., "Doubles Cornhole: with BEEF").

## Suggested Implementation

### Athletic Challenges Table
```sql
CREATE TABLE athletic_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trip_settings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  challenge_type VARCHAR(50) NOT NULL, -- '40_yard_dash', 'standing_jump'
  result_value DECIMAL(10,2) NOT NULL, -- seconds for dash, inches for jump
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trip_id, user_id, challenge_type)
);
```

### API Changes
The `/api/calcutta` endpoint's spotlight data needs to be expanded to include:
- Athletic results for the active participant
- Cornhole singles participation status
- Cornhole doubles partner name
- Thursday scramble score (when scoring system exists)

### Display Layout
The spotlight metadata grid should show cards for:
- 40-Yard Dash (time)
- Standing Jump (height)
- Thursday Scramble (partners + score)
- Friday Scramble (partners)
- Cornhole Singles (in/out)
- Cornhole Doubles (partner)
- Past Wins (accolades)

## Acceptance Criteria

- [ ] Athletic challenges table created with migration
- [ ] Admin UI to record 40-yard dash and standing jump results
- [ ] `/api/calcutta` spotlight includes athletic results
- [ ] `/api/calcutta` spotlight includes cornhole singles participation
- [ ] `/api/calcutta` spotlight includes cornhole doubles partner
- [ ] Calcutta display spotlight renders all data points in readable cards
- [ ] All data readable from 30 feet on a projector
