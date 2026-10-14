Part of #223 (epic). **Pull game results from ESPN and auto-grade matchup picks on a schedule**, reusing boxscore.email's proven ESPN patterns. Per the decisions log: *ESPN grades only* — the admin builds slates; ESPN supplies winners/scores.

## Scope
- **ESPN client** `src/lib/v2/sports/espn.ts` (port from boxscore.email): fetch scoreboard/events for a sport + date → normalize to `{ espn_event_id, team_a_espn_id, team_b_espn_id, score_a, score_b, status, start_time }`.
- **Auto-match** a `v2_matchups` row to its ESPN event by `external_ref.espn_event_id` when present, else by (competitor `espn_id`s + date window). Fill `result` + `status`.
- **Grading pass**: on finalize, set `matchup.result`; rankers derive pick correctness live from `result` (no stored per-pick grade, same as pickem).
- **Cron** `/api/cron/v2-sports-grade` on the `v2-feature-open` atomic-claim template: idempotent (only transitions scheduled/in_progress → final once), frequent during active windows. Optional notify on finalize / standings movement.
- **Fallback**: admin manual result entry still works (writes `result` directly).

## Open decisions (defer to build)
- Cron cadence + active-window detection (poll every N min only when matchups are live, to respect ESPN).
- Which ESPN endpoints per sport; sport id stored in contest `config.sport`.
- Notification policy on grade (per-final vs digest).

## Touch-points
`src/lib/v2/sports/espn.ts` (new), `src/app/api/cron/v2-sports-grade/route.ts` (new), `vercel.json` cron entry, matchup auto-match helper in `slate.ts`.

**Dependencies:** Phase 1 (needs `v2_matchups.external_ref` / `result`). **Blocks:** bracket grading, parlays/props grading.
