Part of #223 (epic). Add **Boxes / Squares** — the 10×10 grid game — as a contest type. Pick-free and luck-based: individuals buy cells **once**, and that square is theirs for **every game in the series**. Before each game, digits 0–9 are randomly (re-)assigned to the rows/columns, and at the end of each scoring period the owner of the cell matching the last digit of each team's score wins that period's payout. Works for any football or basketball game; graded automatically from ESPN period scores (Phase 2).

## Three formats, one model
Square **ownership is contest-level and bought once**; **teams, digits, scores, and payouts are per-game.** You own square (row 3, col 7) for the whole series; each game re-draws digits and puts its own two teams on the axes.
- **One-off** (Super Bowl) — a series of **1** game.
- **Recurring slate** (every Monday Night Football game all season) — same squares, ~17 games, digits re-drawn each week, different teams each week.
- **Tournament** (March Madness, all 63) — same squares, 63 games, **every game pays**; later rounds typically weighted higher.
Multi-game cells cost more (admin sets it), since one purchase covers every game.

## `contest_type = 'boxes'`
Migration: add `boxes` to the `v2_contests.contest_type` CHECK + `CONTEST_TYPES`; `scoring_source='derived'` (graded from ESPN linescores); `auto_enroll=false` (you buy cells, you don't enroll).

## Data model
### `v2_boxes_cells` — ownership, bought once (contest-level)
```
id          UUID PK
contest_id  UUID → v2_contests ON DELETE CASCADE
row         SMALLINT   -- 0..9 grid position
col         SMALLINT   -- 0..9
user_id     UUID → v2_profiles   -- NULL until bought
purchased_at TIMESTAMPTZ
UNIQUE(contest_id, row, col)
```
100 cells per contest. Buying = claim an open (row,col) for `cell_cost_cents`. Ownership persists across every game in the series.

### `v2_boxes_games` — one row per game in the series (per-game state)
```
id           UUID PK
contest_id   UUID → v2_contests ON DELETE CASCADE
espn_event_id TEXT
label        TEXT          -- "Week 5", "R1 - East 1v16", "Super Bowl"
sort_order   INT
team_row     JSONB         -- { name, espn_id } on the ROW axis (per game)
team_col     JSONB         -- { name, espn_id } on the COL axis
digits_row   SMALLINT[]    -- permutation of 0-9, (re)drawn + frozen before this game
digits_col   SMALLINT[]
game_weight  NUMERIC       -- this game's share of the pot (see allocation)
payout_weights JSONB       -- % per period, e.g. {Q1:15,Half:25,Q3:15,Final:45} or {Half:40,Final:60}
locked_at    TIMESTAMPTZ
status       TEXT          -- scheduled | in_progress | final
UNIQUE(contest_id, espn_event_id)
```

### Config (`config.boxes`)
```
{
  format:          'single' | 'slate' | 'tournament',
  sport:           'nfl' | 'mens-college-basketball' | ...,
  cell_cost_cents: 1000,                 -- one-time, covers the whole series
  pot_allocation:  'equal' | 'round_weighted' | 'custom',  -- how the pot splits across games
  default_payout_weights: { ... },       -- per-period default applied to each game
  game_source:     'manual' | 'espn_schedule' | 'bracket'  -- how games get added
}
```

## Game sourcing
- **Manual:** admin picks ESPN events one by one (one-off, or a hand-built slate).
- **ESPN schedule:** auto-pull a team's season / a weekly slate (MNF all season).
- **Bracket/tournament:** reuse the March Madness field from Phase 3 (or an ESPN tournament) to seed all 63 games; new rounds' teams fill in as the bracket resolves.

## Grading (reuses Phase 2 ESPN)
Per game, per period: ESPN linescore gives each team's cumulative score. `rowDigit = lastDigit(team_row score)`, `colDigit = lastDigit(team_col score)`; map back through this game's `digits_row`/`digits_col` to the grid (row,col); the cell's `user_id` is that game-period's winner. Write to `v2_contest_winners` keyed by (game, period) with the allocated amount. Digits are (re)drawn + frozen at each game's `locked_at`.

## Money (pot-split, no house)
- Per-cell purchase = a one-time per-user charge; pot = sold cells × `cell_cost_cents`.
- **Pot allocation across games** (the new multi-game decision):
  - `equal` — pot ÷ games, then each game's `payout_weights` split its slice across periods.
  - `round_weighted` — later rounds/games weighted higher (natural for March Madness: a Final game pays more than a R1 game).
  - `custom` — admin sets each game's `game_weight`.
- Each game-period pays `pot × game_weight × period_weight` to its winning cell owner → `v2_contest_winners` → ledger. Many winners per contest (games × periods); a person can win many times.

## Admin + user UI
- `AddCompetition.tsx`: add `boxes`; choose format + sport, cell price, pot allocation, default payout weights, and the game set (manual / ESPN schedule / bracket).
- `BoxesAdmin.tsx`: monitor sales; per game, (re)draw + lock digits at game time; watch per-game/per-period grading + payouts.
- User: one grid to buy open cells (owned for the whole series) + a per-game board showing that game's teams/digits and lit-up period winners (realtime).

## Live experience (in-game)
Fun to watch, especially a close finish — and it reuses the pure scoring function on the *live* score.
- **Live current-winner highlight:** while a game is in progress, the ESPN cron (#225) polls the current score; the square matching the last digit of each team's **current** score is highlighted live and updates on every connected client via realtime. Watch the winning box move as the game unfolds.
- **Period-end lock + highlight:** when ESPN reports a period complete (Q1 / Half / Q3 / Final), that period's winning square is snapshotted, persisted as the period winner, and **highlighted permanently** (visually distinct from the moving "currently winning" highlight) so people see they won instantly.
- **Push on period-end:** the winning cell's owner gets a push the moment a period closes ("You won Q1 — $X"), via the existing v2 notification system.
- Requires the grading cron to **poll during active games** (not just at final) to track the live score + detect period boundaries; realtime on the boxes game/scores drives the client highlights.

## Open decisions
- **Pot allocation across games** — default `equal`; offer `round_weighted` (March Madness) + `custom`. OT handling.
- **Unsold-cell winner** — carry to pot / organizer / redraw? (stays relevant every game.)
- **Money shape** — per-cell purchase via the Options `quantity` type vs. a direct per-cell ledger charge.
- **Winner dimension** — `v2_contest_winners` has `hole_number` (a per-segment slot); reuse it as a generic game/period segment, or add `game_id` + `period` columns (multi-game needs both dimensions).
- **Per-game vs global payout weights** — default from `config`, overridable per game (`v2_boxes_games.payout_weights`).
- Digit-assignment fairness (server-random, locked, visible) + whether digits draw at sellout or each game's start.
- **Tournament game-set upkeep** — for March Madness, later-round teams aren't known until the bracket resolves; games get their `team_row/col` filled as results come in.
- Out of scope v1: reverse/secondary-digit variants.

**Dependencies:** Phase 0b (#231, group-scoped lane) + Phase 2 (ESPN period/linescore grading); uses the group contest lane + lightweight money/ledger; tournament format can lean on Phase 3's field. Does **not** need Phase 1 (no picks/slate). **Difficulty:** Medium (grid + per-cell one-time money + multi-game per-period grading + pot allocation are the new bits; no picks, no bracket scoring, no house).
