## Overview

Jason pointed out during the app walkthrough that the room-assignments view should be sortable. Today it renders in a fixed order that's hard to scan when looking for a specific person or trying to audit who's in each room.

Add two sort options: alphabetical by name and by room number.

## User Experience

1. On the room-assignments page, a small sort control (segmented toggle or dropdown) offers:
   - **By Name** (alphabetical, A→Z) — default when looking someone up
   - **By Room** (room number / building / floor order) — default when auditing coverage
2. Sort applies to both user-facing and admin views
3. User's preferred sort persists locally (localStorage) so they don't have to re-pick each visit

## Technical Notes

- Client-side sort — no API changes needed
- "By Room" sort needs a canonical ordering for rooms; use room number if numeric, fall back to string sort, with a secondary key of name for stability
- If rooms have sub-ranges (e.g., "102A", "102B"), natural-sort so "102B" follows "102A" and "103" follows "102B"

## Acceptance Criteria

- [ ] Sort toggle visible on the room assignments page
- [ ] "By Name" sorts alphabetically by display name
- [ ] "By Room" sorts naturally by room number
- [ ] Preference persists across visits (localStorage)
- [ ] Works on both authenticated and spectator views (if spectator sees the page)
- [ ] No regression in the default rendering when the user hasn't picked a preference
