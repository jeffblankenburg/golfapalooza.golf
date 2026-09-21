## Summary
Add the course-handicap "pops" dots to the v2 scorer's mini scorecard — the small dots over each hole showing how many handicap strokes a player receives there (allocated to the hardest holes relative to the group's lowest). Present in v1, deferred in the v2 scorer.

## Background
- v1 `LiveScoringEntry` renders 1–3 dots above each player's hole cell based on their **Course Handicap** and the hole's stroke index, computed relative to the group's low handicap. Loozers only (guests / no-index players get none).
- v2 has the pieces: `v2_player_handicaps`, per-tee `handicap_index` on `v2_course_holes`, and the WHS calculator (`calculateCourseHandicap`, stroke allocation). No `/handicaps` endpoint yet for the round.

## Scope
- Add `GET /api/v2/rounds/[id]/handicaps` → per-player course handicap (mirror v1).
- In `ScoreEntry`, compute strokes-received per hole and render the pops dots on the mini scorecard cells, refreshed on roster change.
- Skip guests + players without an established index.

## Visibility rule (refined)
- **Only SHOW the pops dots when the round has an active side game** (Skins/Nassau/etc. — see #183). Pops are meaningless without a net/handicap-based game, so hide them otherwise.
- **Always RESERVE the dot strip's vertical space**, even when hidden, so the scorecard row height / layout is consistent whether or not a side game is on (no reflow when a game is added/removed).
- Implementation: keep the fixed-height dot slot in every cell (as v1 did); render the dots into it only when a side game is active.

## Depends on / relates to
- **#183 (side games)** — the "active side game" signal that gates pop visibility. This issue can ship the reserved-space + endpoint first and light the dots up when #183 lands.

## Notes
Small, self-contained. Part of the My Rounds epic (#174).
