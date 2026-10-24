Part of #223 (epic). **Build the reusable matchup+pick substrate** that every pick-and-grade contest sits on (straight picks, confidence, parlays, props, round-by-round bracket), replacing the pick'em-specific tables. Storage is generic; each contest type supplies only a pure scoring function (the `wolf.ts` / `pickem.ts` pattern). Foundation phase — nothing else starts without it.

## Scope boundary (how this relates to #226)
This is the **contest-scoped slate**: one set of matchups per contest, authored ad-hoc (pick'em week, a parlay card). It is NOT the **shared tournament** of #226 (`v2_tournament_*`, one bracket shared by many contests). The two are deliberately separate tables, but they share:
- the **pick JSONB conventions** (`v2_picks` serves tournament round-by-round picks too),
- the **gradeable shape** (`external_ref` + `status` + `result`) so #225 grades both with one helper,
- the **ranker pattern** (pure `(games, picks, config) => LeaderRow[]`).

See the resolved "tournament games vs v2_matchups" decision in #226 — slates stay contest-scoped; tournaments get their own tables.

## Why
Pick'em today has bespoke tables (`v2_pickem_games`, `v2_pickem_picks`) and lib (`src/lib/v2/contests/pickem.ts`), plus a bespoke grader (`gradePickemFinals` in `pickem-server.ts`) and cron (`v2-pickem-scores`). Every new pick-type would otherwise fork its own game/pick tables + grader. Generalize once → straight/confidence/parlay/prop all reuse storage, locking, grading, ESPN auto-match, and realtime; only the ranker differs.

## New tables (next migration; grants + RLS + realtime like the pickem tables)

### `v2_matchups` (generalizes `v2_pickem_games`)
```
id            UUID PK
contest_id    UUID → v2_contests ON DELETE CASCADE
slot          TEXT          -- contest-defined key ("game-3","r1-east-1v16"); UNIQUE per contest
round         TEXT          -- optional group label ("R1","Thu-early")
sort_order    INT
competitor_a  JSONB         -- { name, espn_id?, seed?, region?, logo?, color? }
competitor_b  JSONB
start_time    TIMESTAMPTZ   -- drives lock
spread        NUMERIC        -- nullable (ATS); points competitor favored by
favorite      TEXT           -- 'a' | 'b' | null
over_under    NUMERIC        -- nullable (O/U)
external_ref  JSONB          -- { espn_event_id?, league? } for #225 grading auto-match
status        TEXT           -- scheduled | in_progress | final
result        JSONB          -- { winner:'a'|'b'|null, score_a, score_b } once final (null winner = push)
is_tiebreaker BOOLEAN
created_at, updated_at
UNIQUE(contest_id, slot)
```
Competitors are JSON refs (not a teams FK) so the substrate is sport-agnostic; ESPN ids + league ride along for grading. `league` moves off a column into `external_ref`/contest `config.sport` (pickem currently stores `league` on the game row — carry it in `external_ref` or competitor JSON).

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
Grants (`authenticated, service_role`) + permissive RLS + realtime, mirroring `v2_pickem_games/picks` exactly (so `LiveScoring`-style `postgres_changes` subscriptions keep working for live standings).

## Shared lib: `src/lib/v2/contests/slate.ts`
- `slateLockAt(matchups)` / `isLocked(matchups, now)` — earliest `start_time` (ports `slateLockAt`/`isSlateLocked` from `pickem.ts`).
- `pickIsCorrect(matchup, pick, config)` — straight (side==winner), ATS (cover vs spread, ports `coveringSide`), O/U (total vs line); returns `bool|null` (null until final / on push).
- `Ranker = (matchups, picks, config) => LeaderRow[]`, pure per type:
  - `rankStraight` — correct count + tiebreaker (ports `rankPickem`, incl. the dense-rank + tiebreaker-diff logic).
  - `rankConfidence` — sum weights of correct.
  - (`rankBracket` in #226, `rankParlay` in #225/#5.)

## Migrate pick'em onto the substrate (behavior-identical)
- **Data migration**: `v2_pickem_games` → `v2_matchups` (away→competitor_a `{name,logo,color}`, home→competitor_b, `winning_team`→`result.winner`, spread/favorite, `game_time`→start_time, `is_tiebreaker`, `league`→external_ref); `v2_pickem_picks` → `v2_picks` (`picked_team`→`{side}`, `tiebreaker_total`→tiebreaker). Backfill in the same migration.
- Keep `pickem.ts` as a **thin adapter** over `slate.ts` + `rankStraight` (preserve `PickemGamePreview`/`buildPickemPreviews` output shape so the admin cards don't change); repoint `PickemAdmin.tsx` + the API route + `listGames`/`loadPickemBoard`.
- Generalize `.../contests/[contestId]/pickem/route.ts` → `.../matchups/route.ts` (GET/POST/PUT/DELETE matchups); keep a pickem alias or repoint callers.
- Generalize `gradePickemFinals` → a matchup grader (this is where #225 takes over); the `v2-pickem-scores` cron calls the generalized grader.

## First substrate-native contest: `straight_picks`
Add `straight_picks` to `CONTEST_TYPES` + the add menus; it needs **zero** new tables (proves the substrate). `defaultScoringSource='derived'`, opt-in. Ranker = `rankStraight`. (Validates the whole stack before bracket/parlay build on it.)

## Touch-points
Migration (tables + grants + RLS + realtime + pickem backfill); `slate.ts` + rankers; `straight_picks` type + admin branch; generalize the pickem API + grader; keep `PickemAdmin`/cards/`buildPickemPreviews` working unchanged.

## Acceptance
- [ ] Pick'em works identically, now on `v2_matchups`/`v2_picks` (admin, picks, previews, grading, leaderboard all unchanged).
- [ ] A new `straight_picks` contest needs **zero** new tables.
- [ ] Lock + grade + rank are shared; only the ranker differs by type.
- [ ] Realtime standings still update live.
- [ ] `npx tsc --noEmit` + `npx eslint` clean; pickem regression-tested.

## Open decisions (design-merit)
- Where `league`/`sport` lives (contest `config.sport` vs per-matchup `external_ref.league`) — pickem mixes leagues rarely; recommend contest-level `config.sport` with a per-matchup override in `external_ref`.
- Whether to keep a `pickem` alias route or repoint all callers to `/matchups`.

**Dependencies:** none (foundation). **Blocks:** #225 (grades `v2_matchups`), #226 (bracket round-by-round picks + the shared gradeable shape), #5/parlays.
