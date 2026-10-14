Part of #223 (epic). **Build the reusable matchup+pick substrate** that every sports-prediction contest (bracket, straight picks, parlays, props) sits on, replacing the pick'em-specific tables. Storage is generic; each contest type supplies only a pure scoring function (the `wolf.ts` / `pickem.ts` pattern). Foundation phase — nothing else starts without it.

## Why
Pick'em today has bespoke tables (`v2_pickem_games`, `v2_pickem_picks`) and lib (`src/lib/v2/contests/pickem.ts`). Every new contest would otherwise fork its own game/pick tables. Generalize once → bracket/parlay/prop/confidence all reuse storage, locking, grading, and ESPN auto-match; only the ranker differs.

## New tables (next migration)

### `v2_matchups` (generalizes `v2_pickem_games`)
```
id            UUID PK
contest_id    UUID → v2_contests ON DELETE CASCADE
slot          TEXT          -- contest-defined key ("r1-east-1v16","game-3"); UNIQUE per contest
round         TEXT          -- optional group ("R1","Sweet 16","Thu-early")
sort_order    INT
competitor_a  JSONB         -- { name, espn_id?, seed?, region?, logo? }
competitor_b  JSONB
start_time    TIMESTAMPTZ   -- drives lock
spread        NUMERIC       -- nullable (ATS)
favorite      TEXT          -- 'a' | 'b' | null
over_under    NUMERIC       -- nullable (O/U)
external_ref  JSONB         -- { espn_event_id? } for grading auto-match
status        TEXT          -- scheduled | in_progress | final
result        JSONB         -- { winner:'a'|'b', score_a, score_b } once final
is_tiebreaker BOOLEAN
created_at, updated_at
UNIQUE(contest_id, slot)
```

### `v2_picks` (generalizes `v2_pickem_picks`)
```
id            UUID PK
matchup_id    UUID → v2_matchups ON DELETE CASCADE
contest_id    UUID → v2_contests     -- denormalized for fast per-contest reads
user_id       UUID → v2_profiles
pick          JSONB   -- one table serves every type:
                      --   straight/bracket { side:'a'|'b' }
                      --   ATS              { ats:'a'|'b' }
                      --   O/U              { ou:'over'|'under' }
                      --   confidence       { side:'a'|'b', weight:N }
tiebreaker    NUMERIC
created_at, updated_at
UNIQUE(matchup_id, user_id)
```
Competitors live on the matchup as JSON refs (not a teams FK) so the substrate is sport-agnostic; ESPN ids ride along for grading. Grants + realtime publication to match the pickem tables.

## Shared lib: `src/lib/v2/contests/slate.ts`
- `slateLockAt(matchups)` / `isLocked(matchups, now)` — earliest `start_time` (or per-matchup).
- `pickIsCorrect(matchup, pick, config)` — straight (side==winner), ATS (cover vs spread), O/U (total vs line); returns `bool|null` (null until final).
- Rankers are **pure functions per type**: `type Ranker = (matchups, picks, config) => LeaderRow[]`.
  - `rankStraight` — count correct + tiebreaker (ports `rankPickem`).
  - `rankConfidence` — sum weights of correct.
  - (`rankBracket`, `rankParlay` land in later phases.)

## Migrate pick'em onto the substrate
- Data migration: `v2_pickem_games` → `v2_matchups` (away→competitor_a, home→competitor_b, winning_team→result, spread/favorite, is_tiebreaker); `v2_pickem_picks` → `v2_picks` (`{side}`, tiebreaker_total→tiebreaker).
- Keep `pickem.ts` as a thin adapter over `slate.ts`+`rankStraight`; repoint `PickemAdmin.tsx` + the API route. Pick'em behavior unchanged.
- Generalize `.../contests/[contestId]/pickem/route.ts` → `.../matchups/route.ts` (GET/POST/PUT/DELETE matchups).

## Touch-points
Migration(s) (tables + grants + realtime + pickem backfill); `slate.ts` + rankers; add `straight_picks` as the first substrate-native `contest_type` (validation); generalize pickem API, keep admin working.

## Acceptance
- [ ] Pick'em works identically, now on `v2_matchups`/`v2_picks`.
- [ ] A new `straight_picks` contest needs **zero** new tables (proves the substrate).
- [ ] Lock + grade + rank are shared; only the ranker differs by type.
- [ ] `npm run build` green; pickem admin + picks regression-tested.

**Dependencies:** none (foundation). **Blocks:** ESPN grading, bracket pool, parlays/props.
