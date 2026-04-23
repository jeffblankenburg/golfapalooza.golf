## Overview

Today the app calculates a single handicap index per player using the USGA formula. The group wants to additionally support **manually-set handicaps per tee color** (e.g., white, yellow, red) for specific courses, based on years of historical scoring data that Randy has in spreadsheets.

This isn't a replacement for USGA handicap — it's an override layer used when the KGB Cup (or other events) wants to use historically-grounded handicaps that reflect how each Loozer actually plays from a specific tee box.

## User Experience

### Admin entry flow

1. Admin opens a "Tee-specific handicaps" page (likely per course, per tee)
2. For each Loozer, enter an 18-hole handicap or hole-by-hole strokes-received
3. Save — values persist per (user, course, tee) triplet
4. Entered values override the calculated USGA handicap for events that opt into the override

### Where it's used

- KGB Cup match-play allocation (primary use case)
- Scramble team handicap calculations (optionally)
- Leaderboards that show net scores

### Display

- On a Loozer's profile, show both "USGA Handicap" and "Tee-specific handicap (yellow)" when set
- Scorecards show strokes-received from whichever source is active for that event

## Technical Notes

- New table: `user_course_tee_handicaps` with `(user_id, course_id, tee_color, handicap_value, per_hole_strokes JSONB)`
- Per-hole strokes optional — if present, overrides the 18-hole allocation; if absent, distribute via stroke index
- Event config gains a flag: "Use tee-specific handicaps when available"
- Handicap resolution function: `resolveHandicap(user, course, tee, event)` → tee-specific if set + flag on, else USGA
- Bulk import UI nice-to-have (CSV paste or per-Loozer grid) given spreadsheet origin

## Acceptance Criteria

- [ ] Admin can enter per-tee handicap for any Loozer/course/tee combo
- [ ] Entered value is used for KGB Cup stroke allocation when the event is configured to use tee-specific handicaps
- [ ] Falls back cleanly to USGA handicap when no override exists
- [ ] Per-hole strokes optionally supported
- [ ] Values persist and are editable later
- [ ] Bulk entry is tolerable (not click-each-cell for 50 players)
