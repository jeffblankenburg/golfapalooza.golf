Part of #223 (epic). **Phase 3 = the shared tournament substrate + the bracket pool (its first consumer).** A bracketed event (March Madness, NFL/NHL playoffs) is a thing *many* contests sit on at once — the bracket pool, the **auction (#227)**, brocket, survivor — all sharing ONE seeded field, ONE bracket tree, and ONE set of results. So the tournament is modeled **once** (org-level), and contests reference it. The bracket pool is the flagship contest that proves the substrate. Group-scoped (event-independent; prerequisite #231).

Grounded in bromadness (`~/GitHub/bromadness.com`): `tournaments` / `teams` / `games` are tournament-scoped and shared across its auction, brocket, and pick'em. We keep that shape; we add ESPN population + manual-first editing on top.

## Why a shared tournament, not a per-contest field

The earlier draft stored the field per-contest (`v2_bracket_field(contest_id, …)`). That duplicates the same 64 teams + bracket + results across the pool AND the auction, and they'd drift. Instead: one `v2_tournament_*`, referenced by every contest via `config.tournament_id`. Results entered once feed the pool standings, the auction's seed-scoring, and the champion/runner-up payouts simultaneously.

This is distinct from #224's **contest-scoped** `v2_matchups` (ad-hoc slates for pick'em/parlays, one set of games per contest). Tournaments are their own shared substrate. The two meet only at the grading layer (see "ESPN grading" below).

---

## Part A — The tournament substrate (the reusable layer)

### Tables (next migration; grants + realtime like the pickem tables)

**`v2_tournaments`** — one bracketed event, org-scoped, shared by many contests.
```
id, org_id, sport (config key, e.g. 'mens-college-basketball'), season (e.g. '2027'),
name, status ('setup'|'locked'|'live'|'final'),
source ('espn'|'manual'), external_ref JSONB ({ espn_tournament_id? }),
config JSONB, created_by, created_at, updated_at
```

**`v2_tournament_teams`** — the seeded field (= `getField()`).
```
id, tournament_id → v2_tournaments ON DELETE CASCADE,
espn_id?, name, short_name?, seed, region?  (region/conference label),
logo_url?, eliminated BOOL DEFAULT false, play_in_slot? (feeds an R1 slot),
UNIQUE(tournament_id, region, seed) partial where not a play-in
```

**`v2_tournament_games`** — the bracket tree (= `getBracket()`), ported from bromadness `games`.
```
id, tournament_id → v2_tournaments ON DELETE CASCADE,
round INT (0 play-in … N final), region?, game_number INT, slot TEXT UNIQUE per tournament,
team_a_id? / team_b_id? → v2_tournament_teams,
next_game_id? → v2_tournament_games, advances_to_slot ('a'|'b'),   -- winner propagation
start_time?, external_ref JSONB ({ espn_event_id? }),
status ('scheduled'|'in_progress'|'final'),
result JSONB ({ winner_team_id, score_a, score_b }) when final,
UNIQUE(tournament_id, slot)
```

### The source interface + adapters
`TournamentSource` (lib): `getField()` → teams; `getBracket()` → games; and the derived reads every consumer needs:
- `teamWins(teamId)` — count of `v2_tournament_games.result.winner_team_id === teamId` (bromadness computes this query-time; the **auction's** points = Σ seed × wins read straight from here).
- `champion()` — final-round winner; `runnerUp()` — the finalist who lost the final.

**Population is a swappable layer, manual-first:**
- **Manual** is a permanent first-class source: admin builds/edits the field (seed + region) and enters results by hand. Always available, for any event we don't adapt or a one-off.
- **Per-league ESPN adapters** (each shipped only when fully correct end-to-end — seeds, regions, the tree, advancement): March Madness is the reference (explicit seeds + 4 regions + First Four), then NFL (14 seeds, 7/conf) and NHL (16 seeds) as their own units. Each fills `v2_tournament_teams` + the initial `v2_tournament_games` from ESPN; the admin can override any seed/pairing.

### Structure generation + advancement (ported from bromadness)
The single-elim tree is deterministic from seeds + regions: fixed R1 pairings `[1,16][8,9][5,12][4,13][6,11][3,14][7,10][2,15]`, then a `buildGameLinks()` pass wires every `next_game_id` + `advances_to_slot`; play-in (round 0) games feed their R1 slot. When a game's `result` finalizes, the winner propagates into `next_game_id`'s `team_{a|b}_id` and the loser is marked `eliminated` — identical to bromadness `handleSetWinner`. Later rounds therefore fill from **actual** results, no re-linking.

---

## Part B — The bracket pool contest (`contest_type = 'bracket'`)

The flagship consumer. Migration adds `bracket` to the `v2_contests.contest_type` CHECK + `CONTEST_TYPES`; `defaultScoringSource='derived'`; `defaultAutoEnroll=false` (opt-in buy-in). `config.tournament_id` binds the pool to a tournament.

### Per-user picks — `v2_bracket_picks`
```
id, contest_id, user_id, slot, picked_team_id → v2_tournament_teams,
UNIQUE(contest_id, user_id, slot)
```
- **`upfront`** (default): users fill the whole bracket before lock; R2+ picks **cascade** (your pick for a slot must be one of your own feeder-slot winners) — enforced client-side, validated server-side.
- **`round_by_round`**: picks are made against the *actual* matchups each round (reuse the #224 `v2_picks` straight-pick pattern against tournament games).

### Config (admin-configurable; sensible defaults need zero fiddling)
```
config.bracket = {
  pick_model: 'upfront' | 'round_by_round',                 // default upfront
  scoring:    'flat' | 'round_weighted' | 'weighted_upset', // default round_weighted
  weights:    [1,2,4,8,16,32],                              // per round when weighted
  upset_bonus: <curve by seed differential>,                // when weighted_upset
  tiebreaker: 'champ_total_points',                         // default
}
```

### Scoring — `rankBracket(source, picks, config)` (pure)
Per slot, compare the user's picked winner to `v2_tournament_games.result.winner_team_id`; award by round weight (+ upset bonus if configured); sum; tiebreak by the champ-game total-points guess. A pure function, same pattern as `pickem.ts` / `rankStraight`.

### Brocket
Not new tables — a bracket pool scoped to round 1 (+2), straight-up, `scoring` = seed of the correctly-picked team. A config/preset of the bracket contest.

---

## How the auction (#227) reuses this
The auction is another consumer of the **same** tournament: `config.tournament_id` → `getField()` seeds its entity catalog; `teamWins()` drives the seed-based points; `champion()`/`runnerUp()` drive the owner bonuses. No auction-owned tournament tables. (The auction's own ownership/bidding tables are separate; see #227.)

## ESPN grading (#225) across both substrates
`v2_tournament_games` and the contest-scoped `v2_matchups` share the SAME gradeable shape (`external_ref` + `status` + `result`). #225's grader auto-matches by `espn_event_id` (else competitor `espn_id`s + date window) and fills `result` on finalize for **both** — one normalized grading helper, two row sources. Rankers read `result` live (no stored per-pick grade). Manual result entry writes `result` directly (and triggers advancement).

## Money
Buy-in as an Option (`setContestBuyIn`), payouts via `payout_splits` + `computePlacePayouts`, winners → `v2_contest_winners`, settle via the ledger, admin edits in `PayoutSplitsEditor`. No new money plumbing.

## Admin + user UI
- `AddCompetition.tsx`: add `bracket` to the event-wide kinds.
- **Tournament manager** (new, shared): create/pick a tournament → import from an ESPN adapter OR build the field by hand → confirm/lock the field → the tree generates → enter/monitor results. Reused by any tournament-based contest (pool, auction, brocket).
- `BracketAdmin.tsx` (new; branched in `[contestId]/page.tsx`): bind the pool to a tournament, set `config.bracket`, monitor grading + standings.
- User: `BracketPicker` (fill the bracket, upfront cascade or per-round) + standings view.
- API: `.../tournaments/*` (field/structure/results CRUD + ESPN import), `.../contests/[contestId]/bracket/*` (picks, standings).

## Touch-points
Migration (tournament tables + grants/realtime + `bracket` contest_type); `src/lib/v2/contests/tournament.ts` (TournamentSource + structure gen + advancement + derived reads); `src/lib/v2/contests/bracket.ts` (`rankBracket`); per-league adapters under `src/lib/v2/sports/`; the shared grading helper (with #225); tournament manager + BracketAdmin + BracketPicker; routes.

## Acceptance
- [ ] One tournament (field + tree + results) is created once and shared: the bracket pool and a second contest (auction stub or a manual check) both read the same `getField()`/`teamWins()`/`champion()`.
- [ ] Admin imports + locks a 64-team ESPN field (March Madness adapter); the tree generates; a manual tournament also works end-to-end.
- [ ] Users fill brackets per the configured `pick_model`; cascade validates in upfront.
- [ ] A result entered once (ESPN or manual) advances the tree, eliminates the loser, and updates pool standings; `rankBracket` ranks by the configured `scoring`; tiebreaker resolves.
- [ ] Buy-in + payouts flow through the existing money model.
- [ ] `npx tsc --noEmit` + `npx eslint` clean.

## Resolved: dedicated tournament tables (not `v2_matchups`)
The tournament bracket lives in its own `v2_tournament_*` tables, **not** in #224's `v2_matchups`. Rationale:
1. **Shared across contests.** One tournament feeds the bracket pool + auction + brocket + survivor at once. `v2_matchups` is contest-scoped (one set of games per contest), so putting the bracket there would duplicate the field/tree/results per contest and let them drift.
2. **Different shape + lifecycle.** Tournament games carry bracket-tree fields (`next_game_id`, `advances_to_slot`, `region`) and a seeded-team FK that don't belong on an ad-hoc slate row; the tournament has its own `setup→locked→live→final` lifecycle, ESPN-populated, independent of any one contest.
3. **No cost to sharing.** `v2_matchups` stays contest-scoped for ad-hoc slates (pick'em/parlays/straight); the two meet only at the **gradeable shape** (`external_ref`/`status`/`result`) and the **pick JSONB** (`v2_picks` serves tournament round-by-round picks), bridged by #225's single `gradeGames` helper. So one grader still covers both without merging the tables.

## Open decisions (design-merit, not scope-cutting)
- Shared-tournament lifecycle: who creates/owns/locks the tournament when multiple contests reference it, and what happens to dependents if it's deleted.
- `upfront` vs `round_by_round` default (recommend upfront).
- Each league adapter's ESPN bracket endpoint shape (March Madness first).

**Dependencies:** #224 (pick substrate patterns + `round_by_round` picks), #225 (ESPN grading, generalized to tournament games), #231 (group-scoped contests). **Enables:** #227 (auction — consumes the tournament), brocket (a preset), survivor + custom brackets (#229).
