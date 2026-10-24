# Epic: sports prediction contests (March Madness family + more)

Extend the v2 contest system beyond golf with a family of **pick-and-grade sports contests**, modeled on the shipped **Pick'em** precedent and ported/expanded from **bromadness.com** (the sibling March Madness "trip for the boys" app, same Next.js + Supabase stack). This is the inflection point where "golf group in a box" becomes a sport-agnostic "trip for the boys in a box."

## Thesis

The v2 contest spine is **already sport-agnostic**. `v2_contests` + `v2_contest_participants` + `v2_contest_winners` + the money stack (`v2_cost_items` → Options → `v2_financial_transactions` ledger) don't care whether a contest is a golf scramble or an NCAA bracket. **Pick'em already proved it** — a non-golf, pick-and-grade contest (college-football ATS) on the exact same rails. These are just more members of that family, and the same engine later runs NFL playoffs, the World Cup, etc.

## What already maps (reuse, near-free)

- **Daily Pick'em (ATS)** → we already have `v2_pickem_games`/`v2_pickem_picks` + `src/lib/v2/contests/pickem.ts`. Bromadness's daily pick'em is that + multi-day + sessions + a tiebreaker game. **Extend, don't rebuild.**
- **Auction (salary-cap draft, seed-based scoring)** → a **standalone contest type** (NOT Calcutta — that's a separate golf-player auction). The third group/event contest type beside Squares + Pick'em. See #227.
- **Money**: buy-in via cost_items/Options, winners via `v2_contest_winners`, `computePlacePayouts`, ledger — reusable by every contest here.
- **Participants / roster sync / exclusions**, the **admin UI shell** (ContestSettings, PayoutSplitsEditor, type-branched detail page), and the **cron pattern** (`v2-feature-open` atomic-claim) — all reusable.

## Contest catalog (ported from bromadness + new)

| Contest | Maps to | New work | Difficulty |
|---|---|---|---|
| Daily Pick'em (ATS, sessions, tiebreaker) | extend `v2_pickem` | multi-day + session split + tiebreaker game | Low |
| Standard bracket pool | new bracket family | bracket structure, round-weighted scoring, round locks | High |
| Brocket (Round 1 only) | bracket subset | scope to round 1 | Low (after bracket) |
| Auction / salary-cap | new standalone type (3rd contest) | entity auction, salary cap, draft-order recorder, seed-based scoring | Medium |
| Parlays (4-leg spread/OU, 8:1) | pick-types on the slate | spread+OU pick types, leg validation, fixed-odds payout | Medium |
| Props / over-unders | pick-types on the slate | market definitions | Medium |
| Survivor / elimination | new type | alive/eliminated state, elimination grading | Medium |
| Custom user-made brackets | bracket engine | single/double-elim advancement, self-serve | High |
| Boxes / Squares (10x10 grid) | new type (pick-free) | grid + per-cell money + per-period grading | Medium |

## The three new primitives (the real work)

1. **A shared "slate" substrate** — generalize `v2_pickem_games`/`_picks` into a reusable **matchup + pick** layer (teams, spread, over/under, times, scores, winner) that bracket, straight picks, parlays, and props all sit on. One substrate, a pure scoring function per type (the `pickem.ts` / `wolf.ts` pattern), config in JSONB.
2. **Bracket structure** — rounds, matchups, advancement, round-locked picks, round-weighted scoring, plus seed-based scoring for the auction. New `v2_bracket_*` tables.
3. **External sports-data ingestion + auto-grading** — **DE-RISKED:** ESPN API integration is already proven in **boxscore.email**. Reuse those patterns: ESPN → cron → update results → auto-grade picks → re-rank → notify. Build the ingestion as a **swappable layer** so manual admin entry remains a fallback, but auto-grading is a first-class capability from the start (bromadness was 100% manual — we can do better).

## Money nuances to settle

- `payout_splits` handles per-place pots. **Survivor** needs "split among those still alive"/winner-take-all; **parlays** need **fixed odds (8:1)**, not a pot split. Add payout `kind`s (`alive_split`, `fixed_odds`).
- Fixed-odds parlays/props mean the pot can go negative → implies a **house/bankroll model**, which bromadness sidestepped with entry pools. Real design question before parlays/props ship.

## "And more" the generic engine unlocks

Confidence pools, head-to-head matchup bets, player props, generic trip prediction markets ("who shows up late", "who wins the golf"), and cross-sport reuse (NFL, World Cup, CFP). All fall out of the shared slate substrate for ~free.

## Phased roadmap (sub-issues)

- **Phase 0 — Decisions** (this epic's companion discussion): data provider + ingestion cadence, the fixed-odds house model, first contests, bracket pick model, survivor payouts, team/entity catalog, sport-agnostic config.
- **Phase 1 — Generalize the slate**: reusable matchup/pick substrate; ship straight-up pick contests for any sport. Low lift, immediate payoff.
- **Phase 2 — ESPN ingestion + auto-grading cron**: reuse boxscore.email patterns. One provider, scheduled grading, standings re-rank, notifications.
- **Phase 3 — Bracket family**: structure + round scoring → bracket pool + brocket.
- **Phase 4 — Auction (standalone 3rd contest type)**: entity auction + draft-order recorder; seed-based scoring + salary cap. Draft ships without brackets; scoring rides results.
- **Phase 5 — Parlays / props**: needs the house/bankroll model.
- **Phase 6 — Survivor + custom user brackets.**

## Guiding principles

1. Never fork per contest — shared storage + a pure scoring function per type + an admin branch + a grading step (exactly how Wolf and Pick'em are built today).
2. Keep money in the single-source model (cost_items/Options/ledger); extend payout `kind`s rather than bespoke money tables.
3. Ingestion is a swappable layer (manual OR ESPN), so contest logic never depends on the data source.
4. Tag contests by sport/tournament in `config` so the same types run NCAA / NFL / World Cup — the "beyond golf" payoff.

## Scope: group contests, not event contests (supersedes earlier "reuse event" decision)

These are **group-scoped** (org-level), **available to all members**, and **event-independent** — a second lane beside the existing event-scoped golf contests. The app runs one active event at a time, and a March Madness / Boxes / season pool isn't a trip, so they must not require or spawn events. `org_id` is already `NOT NULL` on every contest/money table; the only blocker is `event_id NOT NULL`, addressed by the prerequisite **#231**.

| Lane | Scope | Roster | Money | Examples |
|---|---|---|---|---|
| Event contests | `event_id` set | event roster (`on_roster`) | full event money (Options, Trip Cost, balances) | golf scramble, skins, CTP |
| Group contests | `event_id` NULL, `org_id` only | all members, opt-in | lightweight buy-in + payout + settle-up | March Madness, Boxes, pick'em, season pools |

## Sub-issues

- [ ] #231 — Phase 0b (prerequisite): group-scoped contests (event-independent lane) *(lands before Phase 1)*
- [ ] #224 — Phase 1: generalize the pick substrate (slate + picks) *(foundation)*
- [ ] #225 — Phase 2: ESPN ingestion + auto-grading cron
- [ ] #226 — Phase 3: bracket pool (flagship, first ship)
- [ ] #227 — Auction: standalone group/event contest (third type, bromadness NCAA auction)
- [ ] #228 — Phase 5: parlays + props (real-money house/bankroll)
- [ ] #229 — Phase 6: survivor + custom user-made brackets
- [ ] #230 — Boxes / Squares (10x10 grid, per-period payouts) *(pick-free; needs only #225)*
- [ ] #232 — Admin contest testing / simulation tools *(cross-cutting; build alongside #230)*

Build order: **#231 (group-scoped lane, prerequisite)** → #224 → #225 → #226 (first shippable contest), then #227 / #228 / #229 in any order. #230 (Boxes) needs #231 + #225 (ESPN grading) only, so it can ship right after Phase 2 — independent of the slate and bracket work.

## Source material

- Sibling app: https://github.com/jeffblankenburg/bromadness.com (contest catalog + data model reference).
- ESPN ingestion precedent: boxscore.email (proven ESPN API integration — reuse for Phase 2).
- Existing precedent in this repo: Pick'em (`v2_pickem_*`, `src/lib/v2/contests/pickem.ts`, `PickemAdmin.tsx`) and Calcutta.
