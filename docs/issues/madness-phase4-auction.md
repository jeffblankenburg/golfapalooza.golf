# Auction — a standalone group/event contest (third type)

Part of #223 (epic). Add **`auction`** as a first-class contest type — the **third
group- or event-level contest** alongside **Squares** and **Pick'em**. This is NOT a
Calcutta variant; Calcutta is a separate golf-player auction with different scoring and
should not be coupled to this. Model it on **bromadness's NCAA auction**
(`~/GitHub/bromadness.com`, tables `auction_teams` / `auction_entries` / `auction_scores`
+ `tournaments.auction_*` settings).

## The contest, in plain terms

A pool of **entities** (here: all **64** March Madness teams, each carrying its **seed**
1–16) is auctioned off in person. Each participant:

- has a **salary cap** of fake money (bromadness default **$100**),
- must buy **exactly N teams** (`teams_per_player`, default **3**),
- bids in **fixed increments** (default **$5**).

Teams are thrown out one at a time; bidding determines ownership; each entity is owned by
exactly one participant. Later (once games are played) you **score**: points per team win
= that team's **seed number** (a #12 beating a #5 earns 12), so cheap low seeds that make
runs are the win condition. Payouts split among the top points finishers plus the
champion/runner-up owners.

### Bonus teams (the "pairing" mechanic)

The entity count rarely divides evenly by `players × teams_per_player`. The leftover
(lowest) seeds are given away **free** so everyone still ends with N *paid* teams:

- Example: 20 participants × 3 = 60 paid slots, but 64 teams → 4 leftover (the #16s).
  Each leftover is handed to a buyer as a **$0 bonus team** (e.g. "you bought the #13,
  here's a #16 free").

**There is no automatic pairing algorithm in bromadness** — a bonus team is simply an
assignment recorded at **`bid_amount = 0`**, and **$0 teams don't count** toward the
`teams_per_player` requirement. The admin decides who gets the freebies at the table.
(An optional "suggest the free pairings" helper is a nice-to-have, not required for v1.)

## How it runs (ported behavior)

**Participation vs payment are separate.** `auction_entries` tracks `has_paid` (entry fee)
and `is_participating` (handles no-shows / late arrivals). Only *participating* members are
in the draft order and on the board.

**Throwout order.** A deterministic `seededShuffle(participants, order_seed)` (seed stored
on the contest) sets the order, with an optional **pinned first participant**. Rotation is
a plain round-robin: `currentIndex = totalTeamsAssignedSoFar % participantCount`, then
**skip any participant who is "done"** (paid-team count ≥ `teams_per_player`). The board
shows **Next Up** + **On Deck**. Bonus ($0) teams advance the rotation counter but never
mark a player done. An `auction_complete` flag closes it.

**The recorder (the core admin tool).** One fast screen: pick the team, pick the buyer,
type the winning bid (stepped by the increment), **Assign** → next. It must show each
buyer's **remaining budget**, warn on **over-cap**, and let the admin **undo** an
assignment. bromadness also broadcasts the in-progress team to a big-screen **board** via
Supabase realtime (3 rows of buyer columns, each showing name, remaining $, owned teams
with a FREE tag, countdown). The board is a great-to-have; the recorder is the must-have.

**In-app bidding (optional, later).** bromadness was 100% admin-recorded at the table.
Supporting live in-app bids (members tap to raise) is a possible enhancement, not v1.

## Mapping onto the v2 contest spine

Reuse the spine exactly like Pick'em/Squares — shared storage + a pure scoring function +
an admin branch + a grading step; money stays in the single-source model.

- **Type:** add `'auction'` to `v2_contests.contest_type`. Group-scoped by default
  (`event_id` null), event-scoped allowed (rides Options/Trip Cost + #233 overrides).
- **Config (`v2_contests.config`):** `salary_cap_cents`, `bid_increment_cents`,
  `teams_per_player`, `order_seed`, `first_participant_id`, `auction_complete`, and a
  reference to the **entity catalog** (which tournament/team set).
- **Ownership table — new `v2_auction_teams`:** `(contest_id, user_id, entity_id,
  bid_cents)`, `UNIQUE(contest_id, entity_id)`. Grant Data API access. ($0 row = bonus.)
- **Entities (teams + seeds):** the auction needs a **seeded entity catalog**. This
  overlaps the bracket/slate substrate from the epic (#223 Phase 1 / bracket #226) — the
  teams-with-seeds set should come from that shared catalog, not a bespoke table. If the
  substrate isn't ready, a minimal `v2_auction_entities (contest_id, name, seed,
  short_name, logo, eliminated)` unblocks v1 and migrates later.
- **Entry fee + "who's paid":** reuse the existing contest buy-in (cost_item/Options) and
  the **ContestEntryPaid** accordion. `is_participating` maps to
  `v2_contest_participants` (enrolled) with a participating flag (or a status) — confirm
  against how we already gate enrollment.
- **Scoring (needs results, later):** `points = Σ (entity.seed × entity.wins)` over a
  buyer's teams. Needs per-entity win tracking from ESPN ingestion (#225) — manual admin
  entry is the fallback, same as every other contest.
- **Payouts:** points tiers (1st–4th) via `payout_splits`; **champion/runner-up owner**
  bonuses need the bracket champion signal (#226) and likely an extra payout `kind` or a
  small bespoke tier. Rounded to nearest $5 (matches our place-payout rounding).

## Build order (so it ships without waiting on brackets)

The **draft itself is the contest** and is buildable now — it doesn't need results.

1. **Type + ownership + config + entity catalog** (minimal entities table if the substrate
   isn't ready). Buy-in + entry-paid reuse.
2. **The recorder**: assign/undo, budget + cap guards, draft-order rotation with
   done-skipping, bonus ($0) handling, `auction_complete`. This is the deliverable.
3. **The board** (realtime big-screen display) — optional polish.
4. **Scoring + payouts** — rides ESPN ingestion (#225) for wins and the bracket (#226) for
   champion/runner-up; manual entry fallback meanwhile.

## Open decisions

- Entity catalog: reuse the bracket/slate substrate (preferred) vs. a minimal auction-only
  table for v1.
- `is_participating` + no-show handling: new flag on `v2_contest_participants` vs. status.
- Champion/runner-up payout: extra `payout_splits` kind vs. a dedicated owner-bonus tier,
  and where the champion signal comes from.
- In-app live bidding: defer (admin-recorded only for v1)?
- Optional "suggest free bonus pairings" helper (auto-attach leftover low seeds): include
  or leave fully manual like bromadness?

**Dependencies:** none for the draft/recorder; scoring needs #225 (results), champion/
runner-up needs #226 (bracket). **Reference:** `~/GitHub/bromadness.com`
`src/app/admin/auction/*` (recorder + board), `supabase/migrations/0000{5,6,7,8},0001{7,8},0020,0023,0048*` (schema).
