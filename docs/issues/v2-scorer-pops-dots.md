## Summary
Add the course-handicap "pops" dots to the v2 scorer's mini scorecard — the small dots over each hole showing how many handicap strokes a player receives there (allocated to the hardest holes relative to the group's lowest). Present in v1, deferred in the v2 scorer.

## Background
- v1 `LiveScoringEntry` renders 1–3 dots above each player's hole cell based on their **Course Handicap** and the hole's stroke index, computed relative to the group's low handicap. Loozers only (guests / no-index players get none).
- v2 has the pieces: `v2_player_handicaps`, per-tee `handicap_index` on `v2_course_holes`, and the WHS calculator (`calculateCourseHandicap`, stroke allocation). No `/handicaps` endpoint yet for the round.

## Scope
- Add `GET /api/v2/rounds/[id]/handicaps` → per-player course handicap (mirror v1).
- In `ScoreEntry`, fetch it and render the pops dots on the mini scorecard cells (strokes-received per hole), refreshed on roster change.
- Skip guests + players without an established index.

## Notes
Small, self-contained. Part of the My Rounds epic (#174).
