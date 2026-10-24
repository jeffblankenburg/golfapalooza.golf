Part of #223 (epic). **One generalized ESPN grader that auto-fills results for every gradeable game on a schedule** — contest-scoped `v2_matchups` (#224) and shared `v2_tournament_games` (#226) alike. Per the decisions log: *ESPN grades only* — admins build slates/tournaments; ESPN supplies winners/scores; manual entry is always a fallback.

## This is a consolidation, not a from-scratch port
v2 **already** grades from ESPN today: `src/lib/v2/sports/espn.ts` (scoreboard + `fetchGameScore` + `LEAGUES`/`getLeague`, ported from boxscore.email in #230) feeds `gradePickemFinals` (`pickem-server.ts`) via the `v2-pickem-scores` cron, and a parallel path grades squares (`v2-squares-scores`). #225 **unifies these bespoke per-type graders into one grader over a shared gradeable interface**, so new types (bracket, parlay, straight) need no new grading code. The espn.ts client already exists — we extend it, we don't rebuild it.

## The gradeable interface
Both substrates expose the same shape: `external_ref ({ espn_event_id?, league? })` + `status` + `result`. Define `GradeableGame` over that and a single pass that works on either row source:
```
gradeGames(admin, { source: 'matchups' | 'tournament', scope }) :
  1. find rows that are: in an active contest/tournament, ESPN-linked (external_ref or
     resolvable), kicked off (start_time passed, 15m cushion — ports gradePickemFinals),
     and not yet final;
  2. auto-match each to an ESPN event: external_ref.espn_event_id when present, else by
     (competitor espn_ids + league + date window) via fetchScoreboard;
  3. when ESPN marks it FINAL (final total, OT included — never a quarter checkpoint),
     write result + status = 'final' ONCE (idempotent; never overwrite a hand-entered result);
  4. tournament source only: on finalize, PROPAGATE the winner into next_game_id's slot and
     mark the loser eliminated (the advancement #226 defines) — so brackets/auctions update.
```
Rankers read `result` live (no stored per-pick grade, same as pickem today).

## ESPN client (`espn.ts`) additions
Already present: `fetchScoreboard(league, date)`, `fetchGameScore(league, eventId)`, `LEAGUES`, `normalize`. Add only what grading needs:
- An event-by-ids/date resolver for auto-match when `espn_event_id` wasn't captured at authoring time.
- Per-league `status`/final detection already in `fetchGameScore`; extend `LEAGUES` as new sports are adapted (sport id from contest `config.sport` / tournament `sport`).
- (The tournament **field + bracket** fetch — seeds, regions, the tree — belongs to #226's per-league adapters, NOT here. #225 is results only.)

## Cron
Generalize to a single data-gated grader cron, **replacing** the per-type ones:
- `GET /api/cron/v2-sports-grade` on the existing Bearer-`CRON_SECRET` template (mirror `v2-pickem-scores`): calls `gradeGames` for matchups + tournament games. Idempotent (only `scheduled|in_progress → final` once). Every minute but DATA-GATED (only touches ESPN-linked, kicked-off, ungraded rows in active contests/tournaments) — same guardrails `gradePickemFinals` already uses to respect ESPN.
- Retire `v2-pickem-scores` + `v2-squares-scores` once their logic is folded in (or have them delegate to `gradeGames`), so there's one grader. `vercel.json` cron entry added; old entries removed.
- Optional notify on finalize / standings movement (reuse `sendV2Notifications`).

## Fallback
Admin manual result entry still works everywhere — writes `result` (+ status `final`) directly; for tournament games it runs the same advancement. ESPN never required.

## Touch-points
`src/lib/v2/sports/espn.ts` (event resolver, league additions); `src/lib/v2/contests/grade.ts` (new: `GradeableGame` + `gradeGames` + the auto-match helper, absorbing `gradePickemFinals`); `src/app/api/cron/v2-sports-grade/route.ts` (new); `vercel.json` (one cron in, two out); the `v2_matchups`/`v2_tournament_games` finalize → advancement hook.

## Acceptance
- [ ] A final ESPN game auto-fills `result` on `v2_matchups` (pick'em/straight) AND `v2_tournament_games` (bracket) — one grader, two sources.
- [ ] Tournament finalize advances the tree + eliminates the loser (drives bracket standings + auction scoring).
- [ ] Idempotent: re-runs never double-write; a hand-entered result is never overwritten.
- [ ] Data-gated: untouched when nothing is live; respects ESPN (no hammering).
- [ ] Pick'em grading behavior is unchanged after folding `gradePickemFinals` into `gradeGames`.
- [ ] `npx tsc --noEmit` + `npx eslint` clean.

## Open decisions (defer to build)
- Cron cadence + active-window detection (poll every N min only when games are live).
- Which ESPN endpoints per sport (added as each league is adapted; March Madness first).
- Notification policy on grade (per-final vs digest).
- Retire the per-type crons vs. keep them delegating to `gradeGames`.

**Dependencies:** #224 (`v2_matchups.external_ref`/`result`); coordinates with #226 (`v2_tournament_games` + advancement). **Blocks:** bracket grading, auction scoring, parlay/prop grading.
