## Fore(th) Down — football-style match-play side game (v2)

A 2-side, match-play side game themed on American football. Parked here because, unlike Chairman (which derives entirely from per-hole gross scores the app already captures), Fore(th) Down needs **per-hole manual event tagging** during play — most of its scoring is invisible to the app. This issue captures the full ruleset + a feasibility read so we can build it deliberately later. Chairman ships first.

### Ruleset (verbatim from the source card)

**FORE(TH) DOWN — match-play style game**
- Flip a tee. Winner chooses who plays offense first.
- Possession changes after each hole (a FG attempt ends the hole).
- If you pick offense on hole 1, you are defense on hole 10 (possession strictly alternates by hole across the round).
- Can be played over a normal round of golf with these rules layered on.

**Scoring on offense** (offense is the side trying to win the hole)
- Win the hole = **touchdown**.
  - **6 pts** — win hole with **bogey or worse**
  - **7 pts** — win hole with **par**
  - **8 pts** — win hole with **birdie or better**
- Tie or lose the hole = **punt / possession change** (no points).

**Field goals**
- If it looks like you won't win the hole, try for a FG.
- Must **call the FG attempt before taking the shot**.
- Must be attempted from **anywhere off the green**.
- FG shot must **finish inside flagstick distance** from the hole.
- (⚠️ point value NOT stated on the card — see open questions. Football convention = 3 pts.)

**Turnovers**
- If you **lose a ball on offense**, it's a **turnover**.
  - Re-tee with no penalty **OR** take a drop at the hazard, no penalty.
  - You are **on defense** once the new ball is in play.
- Penalty strokes **count on defense**.
- Penalty strokes **count on offense if NOT a turnover**.

**Injuries**
- Hitting into a bunker causes an **injury**: the **club that put the ball in the bunker is out for the remainder of the game**.
- Applies to **both offense and defense**.

**Safety**
- If you're on offense and your tee shot doesn't clear the **front-most tees**, it's a **safety (2 pts to defense)**.
- Re-tee with no penalty, but **on defense now**.

### Why this is harder than Chairman (feasibility)

Chairman is fully **derivable** from the per-hole gross scores already stored in `v2_round_scores` / scramble hole scores. Fore(th) Down is a small **stateful mini-app** layered onto a round: several of its scoring events cannot be inferred from strokes and require an explicit tap during the hole.

| Mechanic | Derivable from scores? | Needs manual input |
|---|---|---|
| Who's on offense (base alternation) | Yes (by hole index + who chose first) | Coin-flip winner + initial choice |
| TD + point tier (6/7/8) | Partially — need who won + their score-to-par | Confirm winner when scores tie-break oddly |
| Field goal attempt + result | **No** | Call before shot (tap) + made/missed |
| Turnover (lost ball flips possession) | **No** | Tap when it happens (mid-hole possession flip) |
| Safety (tee shot short of forward tees) | **No** | Tap |
| Injury (bunker → club disabled) | **No** | Honor-system; optional to track in-app at all |
| Penalty-stroke attribution (off/def) | Partially | Depends on turnover state |

Net: ~4-5 of the mechanics are **manual, in-the-moment events**, and mid-hole possession flips (turnover/safety) mean "possession" isn't a pure function of hole number. That's a genuinely different UI than Chairman's zero-input auto-scoring.

### Open questions (resolve before building)
1. **FG point value** — not on the card. Default to 3 (football convention)? Configurable?
2. **Number of sides** — strictly 2 players, or 2 *teams*? Match-play framing implies 2 sides; confirm team support is needed.
3. **9 vs 18** — "offense on 1 → defense on 10" implies an 18-hole, 2-half structure. How does a 9-hole round behave?
4. **Injuries in-app** — track disabled clubs at all, or leave as pure honor-system (just document in the rules drawer)? Tracking clubs is a lot of UI for a cosmetic rule.
5. **Mid-hole possession flip + "win the hole"** — once a turnover/safety flips possession mid-hole, does the hole still get played out for a TD by the new offense, or is the hole effectively decided? The card is ambiguous; need the house interpretation.
6. **Money** — like Chairman ($/point)? If so, wire through the same cost_items/ledger path as Chairman so both reuse one money model.
7. **Personal rounds AND trip contests** — same dual-scope requirement as Chairman.

### Suggested technical direction (not locked)
- **Personal rounds:** extend `v2_round_games` (migration 00241) with a `game_type='foreth_down'` plus a per-hole event log (new table, e.g. `v2_round_game_events`, keyed by round + hole + side) to record FG/turnover/safety/possession taps. Standings computed from the event log + `v2_round_scores`.
- **Trip contests:** a `v2_contests.contest_type='foreth_down'` with `scoring_source='manual'` (or a hybrid derived+manual), reusing the per-hole event log. Reuse the `v2_contest_observations` pattern if the events fit a (contest, user/side, hole, metric, value) shape.
- Reuse whatever money model Chairman lands on (points × $/point → cost_items/ledger).
- Needs a **live scoring surface** that can hold per-hole state — note v2 does not yet have a group live-scoring UI, so this likely rides on top of whatever Chairman introduces.

### Acceptance criteria (draft)
- [ ] Open questions above answered and folded into a locked ruleset.
- [ ] Works in both personal rounds and trip contests.
- [ ] Per-hole event entry (FG / turnover / safety / possession) with clear, fast taps during play.
- [ ] Running score with the 6/7/8 TD tiers, FG, and safety points; correct possession tracking incl. mid-hole flips.
- [ ] Optional $/point money, reusing Chairman's money model.
- [ ] Rules drawer explaining the game (incl. honor-system injuries if not tracked).

### Reference
Source rules card images are in the originating conversation. Companion game **Chairman** is being built first and establishes the side-game surface this builds on.
