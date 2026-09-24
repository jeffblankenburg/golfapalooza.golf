Part of #174 (v2 My Rounds epic). Follow-up to #183 (Skins + Nassau shipped).

## Overview
Add **presses** to the Nassau side game. A press is a new, concurrent side bet started mid-segment (conventionally when a player goes 2 down) that runs over the *remaining* holes of that segment, settled on top of the original bet.

Deferred deliberately when Nassau shipped (2026-09-24) to keep the first cut simple.

## Scope
- **Manual press**: a "Press" button on a Nassau card (or segment) that opens a new bet from the current hole through the end of that segment. Multiple presses can stack.
- **Optional auto-press**: automatically open a press whenever a player falls 2 down (a per-game toggle).
- Each press is its own match-play bet over its hole range, with the same closeout/dormie logic already in `computeNassau`.
- **Settlement** sums the original segment bet + every press.

## Technical
- Presses need persistence: either rows in `v2_round_games` (a press as a child game with a hole range + `parent_game_id`) or a `presses` array in `config`. A hole-range field is new either way.
- `computeNassau` already closes matches out per hole range — reuse it per press.
- Display: nested/stacked bets under the parent Nassau card without crowding the scorer.

## Acceptance
- Start a Nassau, call a press mid-round, and see the press tracked as its own match with correct closeout and combined settlement.
- Auto-press (if enabled) opens exactly when a player reaches 2 down.
