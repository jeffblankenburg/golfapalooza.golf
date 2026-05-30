## Overview

The Calcutta display (`CalcuttaResults.tsx` / `CalcuttaDisplay.tsx`) is missing data on two surfaces:

1. **Per-Loozer spotlight** — already shows accolades but only as plain title text. Doesn't use the badge images on `accolade_categories.icon_url`, doesn't show partner links for doubles cornhole, doesn't roll up career counts, and lacks supporting Loozer data (handicap trend, attendance count, etc.).
2. **Main Calcutta view** (auction Results / standings / Winners tabs) — accolade badges aren't surfaced at all. A buyer browsing "who owns who" can't see at a glance which of their Loozers have a track record.

Both gaps undersell what we already have in `accolades` + `accolade_categories` (per issue #114's historical import work).

## Sub-tasks

### A. Spotlight depth (`CalcuttaResults.tsx` ~ line 850)
- Use `accolade_categories.icon_url` (badge image) when present; fall back to the emoji `icon`; fall back to the current generic star SVG only as a third option.
- For doubles cornhole accolades, show the partner link (`partner_user_id` is set per migration `00119`).
- Career counts per category — e.g., "🏆 MVL × 3", not a list of three separate rows. Group by category with an aggregate.
- Add other Loozer stats already in the system: current handicap + trend arrow, lifetime attendance count (from unified `event_participants.on_roster`), and biggest-single-round-result if cheap to compute.
- Verify the spotlight on a Loozer with zero accolades degrades gracefully (no empty "Past Wins" card).

### B. Accolades on the main view
- Decide the placement: under each Loozer's name on the **Loozers** tab is the obvious slot; small badge row inline with `display_name`.
- Cap visible badges (e.g., top 3 most recent or most prestigious) with a `+N` overflow chip to keep the row tight.
- Tapping a badge row drills into that Loozer's spotlight (which becomes the "full accolades" view).
- Confirm visibility rules for sold/unsold cells: badges show regardless of auction status (they're a Loozer attribute, not a buy attribute).

## Edge cases

- Loozers with `is_financial_only=true` or `is_system=true` are already filtered from CalcuttaResults; verify the badge rendering doesn't crash if a record sneaks through.
- Custom accolades (`category='custom'`) have free-form titles — make sure the badge image fallback chain handles "no `accolade_categories` row matches" without erroring.
- The spotlight already lives inside `space-y-3` cards; new cards should match that visual rhythm.

## Acceptance criteria

1. Spotlight shows badge images when available, emoji icons otherwise.
2. Doubles cornhole accolades render with both teammates' avatars.
3. Repeat wins in the same category collapse to a single row with a count.
4. Each Loozer card on the main view shows at least the badge icon row when they have ≥1 accolade.
5. Tapping a badge row opens the spotlight.
6. No regression in the existing auction Results / Winners / Summary tabs.
