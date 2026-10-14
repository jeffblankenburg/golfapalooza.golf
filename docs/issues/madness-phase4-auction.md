Part of #223 (epic). Port bromadness's **auction / salary-cap draft** as a variant of the existing **Calcutta** (auction of teams). Users draft/bid teams under a salary cap; points = sum of the seeds of their teams' wins; championship / runner-up / points-tier payouts.

## Scope
- Reuse Calcutta's auction + ownership model where possible; add **salary-cap bidding** (cap + bid increment in `config`) and **seed-based scoring** (points per team win = that team's seed), fed by ESPN results (Phase 2).
- Multi-tier payouts (champion / runner-up / points 1st–4th) via `payout_splits` (extend payout `kind`s if needed).

## Open decisions
- Reuse Calcutta tables vs new auction tables; live-bidding UX; cap enforcement.
- Championship / runner-up detection from bracket results (cleanest if Phase 3 provides the champion signal).

**Dependencies:** Phase 2 (results); ideally Phase 3 (champion/runner-up). **Reference:** bromadness `auction_entries` / `auction_teams` / `auction_scores`.
