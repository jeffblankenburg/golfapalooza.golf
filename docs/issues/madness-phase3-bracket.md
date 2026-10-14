Part of #223 (epic). The flagship contest: a **64-team single-elim bracket pool** on the generalized slate (Phase 1) + ESPN grading (Phase 2), as a **group-scoped contest** (event-independent, available to all members — see prerequisite #231). First contest to ship.

## `contest_type = 'bracket'`
Migration: add `bracket` to the `v2_contests.contest_type` CHECK + `CONTEST_TYPES`; `defaultScoringSource='derived'` (graded from matchup results); `defaultAutoEnroll=false` (opt-in buy-in).

## Data model
### Field (imported from ESPN, admin-confirmed — decisions log)
`v2_bracket_field`:
```
contest_id, espn_team_id, name, seed, region, play_in_slot?   -- 64 (or 68) rows
```
### Structure (standard, generated)
The single-elim slot tree is deterministic from seeds + regions. Each game is a `v2_matchups` row (reuse Phase 1) with `slot` (e.g. `r1-east-1v16`), `round`, and feeder slots encoded in `slot`/config. `competitor_a/b` fill from the field for R1; later rounds fill from **actual** results as they finalize (ESPN auto-match).
### Per-user bracket picks
`v2_bracket_picks`:
```
id, contest_id, user_id, slot, picked_espn_team_id, UNIQUE(contest_id, user_id, slot)
```
In `upfront` mode picks **cascade** (your R2 pick must be one of your own R1 winners) — enforced client-side + validated server-side against the user's feeder picks. In `round_by_round` mode, picks are made against the *actual* matchups each round and can reuse `v2_picks` directly.

## Config (admin-configurable — decisions log)
```
config.bracket = {
  pick_model:  'upfront' | 'round_by_round',                 // default upfront
  scoring:     'flat' | 'round_weighted' | 'weighted_upset', // default round_weighted
  weights:     [1,2,4,8,16,32],                              // per round when weighted
  upset_bonus: <curve by seed differential>,                 // when weighted_upset
  tiebreaker:  'champ_total_points',                         // default, overridable
  sport:       'mens-college-basketball'
}
```
Sensible defaults → quick setup needs zero fiddling; knobs are there.

## Scoring: `rankBracket(field, slots, actualResults, userPicks, config)` (pure)
Per slot: compare the user's picked winner to the actual winner (`matchup.result`); award by round weight (+ upset bonus if configured). Sum; tiebreak by the champ-game total-points guess.

## ESPN grading
Each game's `v2_matchups.external_ref` auto-matches to an ESPN event by (field team `espn_id`s + round date window) — no per-game linking (decisions log). Phase 2's cron fills `result`; `rankBracket` reads it live.

## Money
Buy-in as an Option (`setContestBuyIn`), payouts via `payout_splits` + `computePlacePayouts`, winners → `v2_contest_winners`, settle via ledger. Admin sets winner-take-all / top-N in the existing `PayoutSplitsEditor`. No new money plumbing.

## Admin + user UI
- `AddCompetition.tsx`: add `bracket` to the event-wide kinds.
- `BracketAdmin.tsx` (new; branched in `[contestId]/page.tsx`): import field from ESPN → confirm/lock → set config → monitor grading + standings.
- User: `BracketPicker` (fill the bracket, upfront or per-round) + standings view.
- API: `.../contests/[contestId]/bracket/route.ts` (field/structure/picks), `.../bracket/import` (ESPN field pull); grading via Phase 2 cron.

## Acceptance
- [ ] Admin imports + locks the 64-team ESPN field; structure generates.
- [ ] Users fill brackets per the configured `pick_model`; picks validate (cascade in upfront).
- [ ] ESPN auto-grades; standings rank by the configured `scoring`; tiebreaker resolves.
- [ ] Buy-in + payouts flow through the existing money model.
- [ ] `npm run build` green.

**Dependencies:** Phase 1 (slate), Phase 2 (ESPN grading). **Enables:** Brocket (a scoped round-1 subset), and the bracket engine reused by custom user brackets (Phase 6).
