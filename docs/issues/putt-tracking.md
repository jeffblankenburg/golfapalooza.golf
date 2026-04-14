## Overview

Add putt count tracking to the My Rounds live scoring interface. The `round_scores.putts` column already exists in the database (INTEGER, 0-10) — it just needs UI and API support.

## Implementation

### Live Scoring UI (`LiveScoringEntry.tsx`)
- Add a "Putts" toggle/mode below the stroke +/- buttons for each player on each hole
- When toggled, show a putt counter with +/- buttons (0-10 range)
- Putt count is optional — users can score strokes without tracking putts
- Visual: smaller secondary +/- row, or a tap-to-expand putt entry

### Score Saving (`/api/rounds/[id]/scores`)
- Already accepts `scores` array — add `putts` field alongside `strokes`
- The `round_scores` table already has the `putts` column
- Update the upsert to include putts when provided

### Round Detail Page
- Show putt count per hole in the expandable scorecard (when available)
- Show total putts for the round

### My Rounds Stats
- Add "Avg Putts" to the stats cards on the My Rounds list page
- Track putts per round in round summaries

## Acceptance Criteria

- [ ] Users can enter putt count per hole during live scoring
- [ ] Putt data is saved alongside stroke data
- [ ] Putts display on the round detail scorecard
- [ ] Total putts shown in round summary
- [ ] Putt entry is optional — strokes work without it
