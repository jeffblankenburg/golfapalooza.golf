Part of #174 (v2 My Rounds epic). Depends on the round-logging wizard's hole-by-hole scorer.

## Overview
Real-time, multi-device hole-by-hole scoring — port of the legacy `LiveScoringEntry` / `ScrambleScoringEntry`.

## Scope
- Supabase realtime channel per round (port `src/lib/realtime/round-channel.ts` to v2 tables): score / roster / status changes.
- Dirty-aware merge: local edits win during the debounce window; last-write-wins by server timestamp.
- **Other-groups overlay** ("Groups N") — concurrent groups on the same course can see each other.
- Live / Connecting / Offline status badge.
- Mark-complete propagates to every connected device (they all leave the live view) + posts handicaps via `recalcAffectedPlayers`.
- Scramble variant: single team ball fanned to every roster row.

## Technical
- Enable realtime on `v2_rounds` / `v2_round_players` / `v2_round_scores` (set `REPLICA IDENTITY FULL` where DELETE filtering needs it).
- Reuse the v2 recalc pipeline on completion.

## Acceptance
- Two devices scoring the same round stay in sync (no lost strokes).
- Other groups on the same course are visible while scoring.
- Completing on one device closes the live view on all + updates handicaps.
