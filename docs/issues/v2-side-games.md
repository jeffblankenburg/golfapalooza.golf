Part of #174 (v2 My Rounds epic). Rides on hole-by-hole scoring (needs per-hole scores + net course handicaps).

## Overview
Personal, ad-hoc **side games** within a round — encoded rules + **live win/loss standings** ("you're +2 skins", "2 up on the front"). Distinct from the org-scoped trip contests/payouts in the event system; these are lightweight, no-money-required competitions among the round's players.

## Games (priority order)
1. **Skins** — low score wins the hole's skin; ties carry over to the next hole. Running tally. *(start here — simplest, clearest live standings)*
2. **Nassau** — three matches in one: front 9, back 9, and total (match play). Standings per segment.
3. **Wolf** — rotating "Wolf" each hole picks a partner or goes lone wolf for more points.
4. **Stableford / Modified Stableford** — points per hole vs par (net or gross).
5. **Bingo Bango Bongo** — 3 points/hole (first on green, closest once all on, first in the hole). Levels skill gaps.
6. **Nine-point (5-3-1)** — threesomes; 9 points split each hole.

## UX
- **Opt-in per player** — not everyone in the group plays every game.
- **Gross / net** variants (net uses each player's course handicap).
- **Live standings** strip per active game on the scorer, and a final result at completion.

## Technical
- New per-round game state (likely `v2_round_games` + derived per-hole standings from `v2_round_scores`).
- Net games need course-handicap-per-player (calculator already has `calculateCourseHandicap`).

## Dependencies
- Hole-by-hole scoring (wizard Scores step / live scoring).

## Acceptance
- Start Skins and/or Nassau for a round, opt players in, see correct live standings hole by hole, and a correct final result.
