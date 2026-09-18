Part of #174 (v2 My Rounds epic). Builds on the shipped quick-entry logging (course picker + `POST /api/v2/rounds`).

## Overview
Convert the single-screen `RoundForm` into a multi-step **wizard** with a compact **progress bar**, mirroring the legacy flow (`src/components/my-rounds/RoundForm.tsx`). This is where playing partners, per-player tees, and the scoring-mode choice live, and the foundation for side games.

## Flow (mirrors legacy: Course → Details → Players → Tees → Scores)
1. **Course** — existing picker (whole library, nearest/recently-played on top, opt-in "Use my location", 5.5-row scroll box, club/course presentation from the Courses page).
2. **Details** — date, holes (18 / Front 9 / Back 9), format.
3. **Players** — you + add org members + guests (name only). *Partners come after format (user directive).*
4. **Tees** — per-player tee (partners can play different tees).
5. **Scores** — mode choice: **enter final gross per player** (moves off the setup screen), or **score hole-by-hole** (grid). Hole-by-hole creates the round `in_progress`.

## Progress bar
Compact stepper up top: small numbered dots + connectors, brand fill as you advance, checkmark on completed steps, ring on the current, tappable back to completed steps. Sized down for the 400px drawer (legacy `StepIndicator` is the reference).

## Technical
- Reuse `POST /api/v2/rounds` (already supports `players[]`, eligibility/differential/recalc); extend to accept `hole_scores` on create.
- Players: org roster via the members endpoint; guests via `guest_name` (`v2_round_players` user_id XOR guest_name).
- Hole-by-hole grid: port legacy `ScorecardEntry`/`HoleByHoleEntry`; add `POST /api/v2/rounds/[id]/scores` (batch upsert) + `recalcAffectedPlayers` on completion.

## Acceptance
- 5-step wizard with a tappable compact progress bar.
- Add partners (members) + guests; assign per-player tees.
- Gross-per-player entry OR hole-by-hole grid; completing posts handicaps for eligible players.

## Out of scope (separate issues)
- Live/realtime multi-device scoring.
- Expanded formats; side games.
