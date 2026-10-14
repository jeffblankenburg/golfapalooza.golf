Part of #223 (epic). Fixed-odds games — **4-leg parlays, props, over/unders** — with a **real-money house/bankroll** (the ambitious money model chosen in the decisions log).

## GUARDRAIL (decisions log + #221)
The "house" is a **ledger / accounting construct, NOT app custody.** Wins and losses accrue to member balances; actual cash moves peer-to-peer via settle-up links; the banker is a **person** (treasurer), never the app. This keeps clear of money-transmitter / unlicensed-book territory while delivering the sportsbook feel.

## Scope
- Pick types on the slate (Phase 1): ATS, O/U, and parlay legs (all N must hit). **Fixed-odds** payout (e.g. 8:1), not pot-split.
- Bankroll model: funding source, per-bet + aggregate **exposure caps**, settlement into the ledger (`v2_financial_transactions`). New payout `kind: fixed_odds`.
- Grading via Phase 2 (leg correctness from matchup results); parlay wins only when all legs grade correct.

## Open decisions (own design sub-needed)
- Who/what funds the house; exposure limits; how negative-pot risk is bounded; per-member opt-in.
- Odds source (manual admin vs a feed).

**Dependencies:** Phase 1 (slate), Phase 2 (grading). Heaviest money design in the epic.
