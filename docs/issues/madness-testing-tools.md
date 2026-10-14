Part of #223. Because ESPN data is live and real games happen on their own schedule **with real money on the line**, every ESPN-graded contest needs admin tools to **prove scoring is correct before the real games** — without waiting for or depending on a live game. Can't afford mistakes.

## Two layers of testing (both independent of a live game)

### 1. Dry-run preview — pure function, no ESPN, no commit
All contest scoring is built as **pure functions** (`computeBoxesWinners`, `rankBracket`, `rankStraight`, …). An admin **"Simulate"** panel feeds **hypothetical inputs** and instantly shows the outcome with zero side effects:
- **Boxes:** type each team's score per period (or step a fake game quarter-by-quarter) → winning squares light up + each period's payout + who's owed. No ESPN, no money moved.
- **Bracket:** set hypothetical winners → standings/payout preview.

Verifies the **logic** — eyeball "does square (7,4) win at 17–24?" before anyone buys in.

### 2. Sandbox end-to-end — real pipeline, isolated scope, resettable
A contest flagged **test** runs the *real* grading pipeline but isolated (no real balances, clearly labeled), where the admin **injects results manually** instead of ESPN:
- Set/override a game's final + per-period scores by hand → the actual grading code/cron runs → winners + payouts recorded in the sandbox → verify → **reset** and re-run.
- Or point grading at a **past, already-final ESPN game** (known box score) and confirm the pipeline reproduces the known-correct result.

Verifies the **plumbing**: ESPN auto-match, the cron, the money wiring — end to end.

## Mechanism: one grading path, two result sources
Grading always reads a game's stored `result` (final + linescores). That result is set by **either** ESPN auto-grade **or** admin manual entry. Manual entry **is** the test-injection tool; ESPN is production. No separate test code path to drift out of sync.

## Scope
- **Test flag** on contests (reuse the existing `status='test'` sandbox precedent) → isolates money/standings, labels the contest, hides it from members.
- **Simulate panel** per contest type (pure-function preview, no writes).
- **Manual result override** per game (+ a "pull from a past ESPN game" helper for known box scores).
- **Reset** (clear results/winners/test picks/test purchases) to re-run clean.
- Guardrail: test money never touches real member balances; test contests never surface to members as live.

## Why first-class
With real money and fixed game times, the only safe way to ship a contest is to prove its scoring on controlled inputs first. Build it **alongside the first contest (Boxes)** and reuse for every graded contest after.

**Dependencies:** pairs with #230 (Boxes) and #225 (ESPN). Pattern reused by every graded contest in the family.
