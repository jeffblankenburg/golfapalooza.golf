## Overview

The KGB Cup is played in foursomes, with each match being 2v2 best-ball. When attendance doesn't line up evenly, the group plays **2v1** (three players, one side plays alone) or **3v2** (five players, one side plays as a threesome best-ball). Today the scoring UI assumes even 2v2 and breaks down when team sizes are uneven.

Add support for uneven team sizes in KGB Cup match scoring.

## User Experience

### Admin setup

1. When creating a KGB Cup match, the foursome/fivesome screen lets the admin assign players to Team A or Team B with uneven counts
2. Supported configurations: 2v2 (today), 2v1, 3v2, 1v1
3. Warning/info text explaining the scoring implication (best-ball of however many players are on each side)

### Scoring UI

1. Scorekeeper enters individual scores for every player (regardless of team size)
2. Hole winner is determined by comparing each team's best-ball net score
3. Leaderboard shows match result the same way it does today
4. No visual glitches when one team has fewer rows than the other

### Edge cases

- 1v1: just a match-play between two players — works as a degenerate best-ball
- Forfeits mid-round: if one player has to leave, hole scoring continues with remaining teammates
- Stroke allocation: each player gets their own strokes based on their handicap, regardless of team size

## Technical Notes

- The KGB Cup scoring module likely hardcodes team size or uses array pairing assumptions — audit and relax
- Net best-ball logic: per hole, for each team, take `min(player.netScore for player in team)`
- Uneven teams don't require new schema — team assignments are already per-player via `kgb_cup_teams` or similar; just allow any count >= 1 on a side
- Guardrails: reject 0-player teams; warn on heavy imbalance (>2 player gap)

## Acceptance Criteria

- [ ] Admin can set up 2v1 and 3v2 KGB Cup matches
- [ ] Scoring UI handles uneven teams without layout breakage
- [ ] Best-ball net calculation correctly identifies the hole winner
- [ ] Final match result (up/down/AS) reflects uneven-team outcomes accurately
- [ ] Handicap strokes still applied per individual player
- [ ] 1v1 works as a degenerate case
