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
- **Entities (teams + seeds):** come from a **pluggable tournament source** — see below.
  The ownership table FKs an `entity_id`; a minimal `v2_auction_entities (contest_id,
  name, seed, region/conf, short_name, logo, eliminated)` is the concrete store, populated
  either by an ESPN adapter or by hand.
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

## Entity catalog = a pluggable tournament source (ESPN-populated)

The admin shouldn't hand-build the field (bromadness did — 100% manual team entry over a
static catalog). Instead, the admin **picks a tournament** ("March Madness 2027", "NFL
Playoffs", "Stanley Cup Playoffs") and we **auto-populate the seeded field from ESPN**,
with full manual override. This one primitive is shared by the whole madness family.

```
TournamentSource (league + season/event)
  ├─ getField()    → seeded entities [{ team, seed, region/conference, logo }]   ← the AUCTION needs ONLY this
  └─ getBracket()  → matchups + advancement + champion/runner-up signal          ← bracket pool (#226) + seed-scoring
```

- **One interface, per-league adapters.** Our current ESPN client only reads the
  *scoreboard* (`espn.ts`), so this adds a new fetch + a small adapter per league, since
  ESPN's bracket/tournament endpoints differ by sport. **March Madness** is the cleanest
  (explicit seeds + regions); **NFL** (14 seeds, 7/conference) and **NHL** (16 seeds) are
  available but shaped differently and only finalize once the field clinches.
- **Manual override is always present** (swappable-layer principle, like every other
  contest's grading): import the field, then fix any seed/pairing; or skip ESPN entirely
  and enter the field by hand for a one-off/custom auction.
- **Why this unifies things:** the same source that seeds the auction also feeds the
  **bracket pool**, the **per-team win counts** for seed-scoring, and the **champion/
  runner-up** payout signal — so "auction entity catalog" and "bracket structure" are one
  primitive, not two. The tournament source is therefore built **in the shared substrate
  (#226) from the start**; the auction is a consumer of it (`getField()`), not an owner of
  a parallel importer. No throwaway, no later migration.
- **Sport-agnostic by construction:** the field is just seeded entities behind an adapter,
  so the auction runs for any bracketed event (NCAA / NFL / NHL / World Cup / CFP) with no
  contest-logic changes — only a new adapter.
- **Per-league adapters, each fully correct.** One `TournamentSource` interface; a league
  adapter is added only when its `getField()`/`getBracket()` is correct end-to-end (seeds,
  regions/conferences, advancement). **March Madness** is the reference implementation
  (explicit seeds + regions); NFL (14 seeds, 7/conference) and NHL (16 seeds) are added as
  their own correct adapters. Incremental by league, never by half-built feature.
- **Manual entry is a first-class source, not a stopgap** — the same `getField()` contract
  backed by admin input, for a one-off/custom auction or any event we don't adapt. It
  coexists with ESPN adapters permanently, not "until ESPN is ready."

## Build order (dependency-correct layering)

Layered so each piece sits on a finished foundation — not sequenced to get a partial
contest out early. The draft, the field source, and scoring are **separate concerns**, so
they're built as clean layers, not a race.

1. **Shared tournament/entity substrate (#226)** — the `TournamentSource` contract +
   `v2_auction_entities` (or the substrate's entity store) + the manual-entry source +
   the March Madness adapter, all correct. The auction depends on this; it is not stubbed.
2. **Type + ownership + config** — `'auction'` type, `v2_auction_teams`, config; buy-in +
   entry-paid reuse.
3. **The recorder**: assign/undo, budget + cap guards, draft-order rotation with
   done-skipping, bonus ($0) handling, `auction_complete`.
4. **Scoring + payouts** — seed-based points from the substrate's per-team win counts
   (#225) and champion/runner-up from the bracket (#226). Manual result entry is the
   permanent fallback source, same contract.
5. **The board** (realtime big-screen display).

## Open decisions

- Which leagues get an adapter (each a correct, standalone adapter behind the shared
  interface). March Madness is the reference; NFL/NHL are their own units of work.
- `is_participating` + no-show handling: new flag on `v2_contest_participants` vs. status.
- Champion/runner-up payout: extra `payout_splits` kind vs. a dedicated owner-bonus tier,
  and exactly how the substrate exposes the champion signal.
- In-app live bidding: build it as a real mode alongside the admin recorder, or admin-only?
  (Decide on merit, not effort.)
- Optional "suggest free bonus pairings" helper (auto-attach leftover low seeds): include
  or leave fully manual like bromadness?

**Dependencies:** the shared tournament/entity substrate (#226) is a prerequisite — the
auction consumes its `TournamentSource`/`getField()` rather than carrying its own. Scoring
additionally uses results ingestion (#225) and the bracket champion signal (#226).
**Reference:** `~/GitHub/bromadness.com`
`src/app/admin/auction/*` (recorder + board), `supabase/migrations/0000{5,6,7,8},0001{7,8},0020,0023,0048*` (schema).
