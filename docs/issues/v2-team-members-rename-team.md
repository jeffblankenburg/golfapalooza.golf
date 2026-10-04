# Let team members rename their own team (v2)

## Overview

In the v2 admin flow, an admin can already rename a scramble team off the default
"Team N" via the Teams manager (`.../admin/events/{eventId}/contests/{contestId}/teams`).
We want the **members of a team** to be able to rename it too, from the member-facing
side of the app (not just admins).

This is a small, fun bit of ownership: a foursome names themselves ("The Shank Brothers"),
and that name shows wherever the team appears (scoreboards, tee sheets, standings).

## UX flow

- A member who is on a scramble team sees their team's name with an inline edit affordance
  (pencil / tap-to-edit) on whatever member screen surfaces their team (scoring / schedule /
  contest detail — TBD which surface(s)).
- Editing commits the new name; empty reverts to the "Team N" default placeholder.
- Name change is visible to teammates and admins in near-real-time (or on next load).
- Reasonable length cap (match the admin input: 40 chars) and trimming.

## Technical plan

- Team name lives on `v2_scramble_teams.name` (already editable by admins via the teams PUT).
- Add a member-scoped endpoint (e.g. `PATCH /api/v2/events/{eventId}/contests/{contestId}/teams/{teamId}/name`)
  that gates on "requester is a member of that team" (via `v2_scramble_team_members`) OR an admin.
  Use `getEffectiveUserId` + the admin client so RLS doesn't silently no-op.
- Keep the admin teams PUT as-is; this is an additive, narrowly-scoped write (name only).
- Decide the member surface(s) to mount the editor on.

## Edge cases

- Member removed from the team after starting an edit → reject (not on team anymore).
- Two teammates editing at once → last write wins (fine for a name).
- Name collides with another team's name → allow (names aren't unique).
- Guests / non-members viewing → read-only.

## Acceptance criteria

- [ ] A team member can rename their own team from a member-facing screen.
- [ ] A non-member (and non-admin) cannot rename a team they're not on.
- [ ] Admins can still rename any team from the Teams manager.
- [ ] Cleared name falls back to the "Team N" default everywhere.
- [ ] New name propagates to all surfaces that display the team.

## Notes

Filed per user request while building the admin teams drag-to-reorder + payouts-modal work.
Deferred to an issue intentionally (not built yet).
