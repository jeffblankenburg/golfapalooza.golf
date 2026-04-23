## Overview

Cornhole players track their "8-bag average" — the average score a player puts up when they throw 8 bags (one round). Experienced players use this to seed tournaments, set handicaps, or trash-talk. Add the ability to record each Loozer's 8-bag average and display it on their profile and the cornhole tournament views.

## User Experience

### Entry (Admin)

1. Admin opens a Loozer's profile, or a cornhole-admin page
2. Field: "8-bag average" (decimal, 0.0–80.0 typically)
3. Optional: date last updated + notes (e.g., "Calculated from 10 rounds at 2025 trip")
4. Save — value persists on the user record

### Display (All users)

1. Loozer profile shows "8-bag avg: 14.3" alongside other stats (cornhole singles/doubles titles, etc.)
2. On the cornhole singles bracket page, each seed card shows the player's 8-bag average next to their name
3. On the cornhole doubles team card, show the team's combined/average 8-bag average
4. Missing data: show "—" (no broken UI)

### Bulk entry

- Nice-to-have: an admin grid where all Loozers' averages can be updated at once (CSV paste or spreadsheet-style)

## Technical Notes

- New column on `users`: `cornhole_8bag_avg NUMERIC(4,2)` (nullable)
- Update admin user edit UI to include the field
- Bracket/team display reads the field and renders it next to names
- Seed bracket generation could optionally use 8-bag average to seed (out of scope for this issue, but worth flagging)

## Acceptance Criteria

- [ ] Admin can set a Loozer's 8-bag average on their profile
- [ ] Value displays on the Loozer's public profile page
- [ ] Value displays on cornhole singles bracket cards
- [ ] Value displays on cornhole doubles team cards
- [ ] Missing values render cleanly as "—"
- [ ] No migration-destructive changes (additive column only)
