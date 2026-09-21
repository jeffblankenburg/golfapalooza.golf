## Summary
Parity sweep of the shipped v2 My Rounds scorer / round detail against v1's scoring
surface (`LiveScoringEntry`, round detail, `RoundForm`). These v1 affordances were
**not carried over** and are not tracked elsewhere. Filed per the parity-gap habit —
none of these block the current flow, but they're silent drops from v1.

## Gaps
- **Edit a completed round.** v1 lets you reopen/edit scores, tee, and roster after
  completion (co-equal ownership, #130). v2's detail is read-only once completed — the
  only post-completion action is remove-my-score / delete. No path to fix a mistyped
  hole after finishing.
- **Round notes field.** v1 rounds carry a free-text notes field surfaced on the detail
  page. v2 has no notes (comments exist, but that's a different, social surface).
- **Add / remove players from the round detail.** v1 manages the roster from the detail
  page post-create; v2 only sets the roster in the create wizard. No way to add a late
  joiner or drop a no-show after the round exists.
- **"View all courses" link** from the course-selection step. v1 links out to the course
  directory; v2 dead-ends at search.
- **Favorite/follow star on the round detail** for each listed player (v1 surfaces the
  follow control inline on players you're viewing). v2 only exposes follow from the
  members directory (#187).
- **OtherGroupsOverlay — concurrent groups on the same course.** v1's scorer shows a
  "Groups N" button so simultaneous groups can see each other live. v2's scorer has no
  cross-group awareness. (Related to realtime #181, but a distinct affordance.)

## Not gaps (intentional v2 differences / already tracked)
- Partial putts UI + in-scorer map → #184, #188.
- Scramble / expanded formats → #182, #183 (out of personal-scorer scope for now).

Part of the My Rounds epic (#174).
