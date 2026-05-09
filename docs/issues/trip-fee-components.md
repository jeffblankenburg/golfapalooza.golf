# Refactor: cost_items — single source of truth for every dollar in the system

## Status

**Predecessor to #124.** Target completion: well before the next trip's
active window opens (~120 days from filing). The unified contest model in
#124 gets dramatically smaller once this lands.

## Hard constraints (non-negotiable)

Same as #124: zero downtime, zero broken features at any point, every
phase reversible, no destructive change until the new path has been
verified live for a week, no mid-trip destructive cleanup.

**Plus one more, specific to this issue:**

> **The cost-item breakdown is admin-only. Loozers never see the line
> items that comprise Trip Cost — they only see "Trip Cost: $651."**

This is a UX rule, not a permissions rule. The data exists in
`cost_items` and admins can read every row, but no Loozer-facing
surface ever expands the lump into its components. Why: pulling the
curtain back on internal budget discipline (hotel = $X, food = $Y,
scramble pots = $Z, operational = $W) changes the social contract.
Loozers pay the trip cost; they don't review its budget.

Concretely:
- `MyFinancials` and any `(app)/` ledger page show "Trip Cost: $651"
  as a single line item, exactly as today.
- The new `/admin/financials/cost-items` page shows the full
  breakdown — admin-only.
- Spectator pages stay completely free of the breakdown.
- Don't add a "see what's in your $651" expansion anywhere
  Loozer-facing.
- Same rule for derived per-contest pots: admins see "Thursday Team
  pot = $10/attendee × 38 attendees = $380"; Loozers do not.

## The principle

**Every dollar that exists in the system points to one row in
`cost_items`.** Admins never type a dollar amount in two places — they
type it on the cost item, and every consumer (option costs, payout
amounts, charges, financial calculators) picks from the same dropdown.

When a price changes, admin edits one row, and every linked surface
updates simultaneously.

## The problem today

Dollar amounts live in at least 6 different places:
- `trip_options.cost` (top-level option price)
- `trip_options.choices[].cost` (per-choice in select-type options)
- `payout_sheet_events.amount_per_participant` (per-row payout amount)
- `pickem_settings.entry_fee` (Pickem entry fee)
- Hardcoded constants in `scripts/seed-payout-sheet-events.mjs`
  (Scramble Team, Skins, Long Putt amounts)
- Implicit math (e.g. Lodge Mon = "Mon+Tue choice cost" − "Tue-only
  choice cost" = $145 − $80 = $65)

Symptoms:
- The $651 "Trip Cost" is opaque — nobody can break it down without
  asking the admin who set it
- Adjusting one cost requires updating it in N places
- Drift is silent: nothing alerts when payouts no longer reflect the
  option price they were derived from
- New admins can't reason about "where does my money go"

## The fix: one table, FK references live on the consumers

```sql
CREATE TABLE cost_items (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trip_settings(id) ON DELETE CASCADE,

  name VARCHAR(120) NOT NULL,             -- "Hotel — main 3 nights" / "Pickem entry"
  description TEXT,
  cost NUMERIC(10,2) NOT NULL,
  category VARCHAR(40),                   -- 'lodging' | 'food' | 'event_pot' | 'option_entry'
                                          -- | 'operational' | etc.

  -- Bundled into the bulk Trip Cost ($651 today)?
  included_in_trip_cost BOOLEAN NOT NULL DEFAULT false,

  sort_order SMALLINT NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cost_items_trip ON cost_items(trip_id, sort_order);
```

That's the whole catalog. Two flags govern what a row means:

1. **`included_in_trip_cost = true`** → contributes to the bulk Trip Cost
   that everyone going pays. Sum gives you the lump.
2. **`category`** → bookkeeping grouping (`lodging`, `food`, `event_pot`,
   `option_entry`, `operational`, `pass_through`, etc.).

**FK direction note.** Cost items are a pure catalog. They don't know
who's pointing at them. The relationships live on the *consumer* side:

- `contests.buy_in_cost_item_id` → cost_items (added in #124)
- `trip_options.choices[].cost_item_ids` → cost_items (added in this issue)

This way, a contest *has* a buy-in (single FK lookup); an option choice
*has* one or more cost items it bundles. Editing or removing a cost item
doesn't require knowing every consumer up front.

## Universal references everywhere else

Instead of dollar columns, every other table that mentions money holds
a foreign key (or array of FKs) into `cost_items`:

### `trip_options.choices` references cost items per choice

`trip_options.choices` JSONB shape (today: `[{label, value, cost}]`)
becomes `[{label, value, cost_item_ids: [uuid, ...]}]`. The choice's
total cost is the sum of its referenced items.

Examples for current options:
- "Closest To The Pin" Yes → `[{cost_item: "CTP entry"}]`
- "Extra Hotel Nights" "Mon & Tue" → `[{cost_item: "Lodge Mon"}, {cost_item: "Lodge Tue"}]`
- "Extra Hotel Nights" "Tue night" → `[{cost_item: "Lodge Tue"}]`
- "100 Feet!" Yes → `[{cost_item: "100 Feet entry"}]`

The Lodge $145 / $80 / $0 prices stop being entered anywhere — they're
sums of referenced items. The implicit "$145 − $80 = $65 for Mon"
calculation goes away because Lodge Mon is its own row.

### `trip_options.cost` (single-cost options) → derived

For checkbox options like "Trip Cost," cost = sum of all
`included_in_trip_cost=true` items for the trip. The column either
becomes generated/computed or admins simply stop entering it.

### `payout_sheet_events.amount_per_participant` → goes away entirely

Pot for a contest = `cost_items` where `payout_target_contest_id =
that contest`. Per-attendee amount = the cost item's `cost`. Total pot
= cost × eligible attendee count. The cash-needed sheet renders by
querying `cost_items` directly.

### `pickem_settings.entry_fee` → becomes a cost_item reference

The Pickem option's "Yes" choice points at the "Pickem entry" cost item.
Pickem reads the entry fee from there.

### Hardcoded amounts in seed scripts → gone

The seed builds cost items, not amounts. After this lands, no dollar
amount is hardcoded in any TypeScript or JavaScript file.

## Admin UX

A new admin page `/admin/financials/cost-items` is the catalog.
Add / edit / delete / reorder. Categorized view.

Anywhere else in the admin that today shows a dollar input, replace
with a **cost item picker**:
- `/admin/options` choice editor → "Add cost item" picker (multi-select
  for choices that bundle several items, like Lodge Mon+Tue)
- `/admin/financials/payout-events` → admin picks the payout target
  contest and the cost item; amount is read-only and displayed inline
- New trip wizard → pre-populates a starter cost catalog from last
  year's trip (or from a template)

Live derived totals show on every page:
- Cost items page: "Trip Cost = $X (sum of bundled items)"
- Options page: each choice shows "$Y (= sum of N items)"
- Payout-events page: each row shows "$Z/attendee (linked to: <item name>)"

## Example: today's trip, expressed as cost_items

```
trip_id = Golfapalooza XXX (1de37153-...)

| name                        | cost  | in_trip | category    |
|-----------------------------|-------|---------|-------------|
| Hotel — main 3 nights        | 200   | yes     | lodging     |
| Food & beverage              | 150   | yes     | food        |
| Operational / misc           | 386   | yes     | operational |
| Thursday Team pot            | 10    | yes     | event_pot   |
| Friday Team pot              | 10    | yes     | event_pot   |
| Saturday Team pot            | 10    | yes     | event_pot   |
| Thursday Skins pot           | 10    | yes     | event_pot   |
| Friday Skins pot             | 10    | yes     | event_pot   |
| Saturday Skins pot           | 10    | yes     | event_pot   |
| Thursday Long Putt pot       | 5     | yes     | event_pot   |
| Friday Long Putt pot         | 5     | yes     | event_pot   |
| Saturday Long Putt pot       | 5     | yes     | event_pot   |
|                              | =$651 | (Trip Cost = sum of bundled items)|
| CTP Front Thu pot            | 2.50  | no      | event_pot   |
| CTP Back Thu pot             | 2.50  | no      | event_pot   |
| (CTP Fri/Sat × 2 = 4 more)   | 2.50  | no      | event_pot   |
| Thu Long Drive pot           | 5     | no      | event_pot   |
| (Fri/Sat = 2 more)           | 5     | no      | event_pot   |
| 100 Feet pot                 | 10    | no      | event_pot   |
| Pickem entry                 | 20    | no      | event_pot   |
| KGB Cup entry (pass-through) | 55    | no      | pass_through|
| Boland bet                   | 10    | no      | event_pot   |
| Lodge Mon                    | 65    | no      | lodging     |
| Lodge Tue                    | 80    | no      | lodging     |
```

Each `event_pot` cost item is referenced from the `contests` side via
`contests.buy_in_cost_item_id`. Each lodge / option entry is referenced
from the `trip_options.choices[].cost_item_ids` JSONB array.

Then `trip_options.choices` referencing these items:

```
"Closest To The Pin" Yes  → [CTP Front Thu, CTP Back Thu, ...×3 days = 6 items]
"Long Drive Contest" Yes  → [Thu LD, Fri LD, Sat LD]
"100 Feet!" Yes           → [100 Feet pot]
"Whitey's CFB Pick'em" Yes → [Pickem entry]
"KGB Cup" Yes             → [KGB Cup entry]
"Boland Bet" Yes          → [Boland bet]
"Extra Hotel Nights":
  "Mon & Tue night, and Wed breakfast" → [Lodge Mon, Lodge Tue]
  "Tue night, and Wed breakfast"       → [Lodge Tue]
  "No Thanks"                          → []
"Trip Cost"               → derived from in_trip=true items = $651
```

Every dollar is one row. Every reference is a dropdown.

## Migration plan (zero-downtime)

### Phase 1 — schema (additive)

1. Create `cost_items` table.
2. No code reads or writes it yet.

**Verification:** schema migration runs, no behavior change.
**Rollback:** drop the table.

### Phase 2 — backfill from current sources (additive)

1. One-shot script creates `cost_items` rows mirroring the current
   amounts:
   - One per `payout_sheet_events` row
   - One per `trip_options.cost` (or per choice cost)
   - The opaque "operational" portion of $651 gets a single
     "Operational" item until admin breaks it down further
2. Validate: `SUM(cost WHERE included_in_trip_cost=true)` =
   current Trip Cost option's value. For each option, sum of items
   referenced by its choices = current option cost.

**Rollback:** delete the rows.

### Phase 3 — switch reads (one consumer at a time, behind feature flags)

Each switch behind a flag with side-by-side verification log for one
week before flag removal:

1. Cash-needed sheet (Payout Denominations tab) reads pots from
   `cost_items.payout_target_contest_id`.
2. Trip Cost option's cost becomes computed (mirrored in the stored
   `cost` column for any straggler reads).
3. Other option costs become computed from referenced cost items.
4. Pickem entry fee reads from cost item.
5. Skins per-player amount reads from cost item.
6. Winners grid reads pot totals from cost items.

**Rollback:** flip the flag.

### Phase 4 — switch writes

1. Admin UI for cost items goes live.
2. Cost item picker replaces dollar inputs across:
   `/admin/options`, `/admin/financials/payout-events`,
   `/admin/events/[tripId]/pickem`.
3. Edits to a cost item propagate everywhere automatically.
4. Seed scripts and new-trip wizard write cost items, not amounts.

**Rollback:** legacy dollar inputs still work against stored values.

### Phase 5 — destructive cleanup (between trips only)

1. Drop `payout_sheet_events.amount_per_participant`.
2. Drop hardcoded amounts from seed scripts.
3. `trip_options.cost` and per-choice cost either become generated
   columns or are removed.
4. `pickem_settings.entry_fee` removed (read from cost item).

## Relationship to #124

This issue is **the new Phase 0 of #124.** With cost items as the spine,
#124's plan simplifies considerably:

- `contests.buy_in` column not needed — buy-in derives from cost items
  targeting the contest.
- `pot_source` / `fixed_pot` columns on `contests` not needed — every
  pot has the same shape.
- `contest_payout_structure` only needs to describe the SPLIT of an
  existing pot, never the dollar amount. Pot total comes from cost items.
- The "Skins as child contest" pattern still applies, but its pot is
  one cost item targeting the Skins contest.

#124 is updated to depend on this issue.

## Acceptance Criteria

- [ ] Every dollar amount in the system traces back to exactly one
      `cost_items` row.
- [ ] Trip Cost = `SUM(cost) WHERE included_in_trip_cost = true` and is
      no longer typed by an admin.
- [ ] Each `trip_options` choice's cost = sum of its referenced cost
      items (no more typed dollar amounts on choices).
- [ ] Each contest's pot per attendee = cost item where
      `payout_target_contest_id = that contest`.
- [ ] Admin can add a new payout-bearing item by creating one cost item
      row + linking it to a contest — no code change required.
- [ ] No dollar amount is hardcoded in any TypeScript or JavaScript file
      after Phase 5.
- [ ] Cost item picker is available everywhere the admin previously typed
      a dollar amount.
- [ ] "Where does my $651 go?" is a single SELECT.
- [ ] **Loozer-facing surfaces still show "Trip Cost: $651" as one
      opaque line item.** No `(app)/` page exposes the cost-item
      breakdown. The breakdown is admin-only.

## Effort estimate

- Active coding: **3–4 days** (most of it is admin UI for the catalog
  and the cost-item picker component, which gets reused everywhere)
- Including phased rollout + verification windows: **~4–6 weeks
  calendar**

## Dependencies

- Blocks #124. #124 references this as Phase 0.
- No code-level dependencies; the table is standalone.

## Open questions

- **Cross-trip catalog?** Should cost items be trip-scoped (current
  proposal — same conceptual cost gets a fresh row each year) or
  global with a "current price" lookup per year? Trip-scoped is
  simpler and matches reality (prices change annually); global needs
  versioning. Recommend trip-scoped.
- **Templates / cloning.** Will admins want to clone last year's
  catalog when creating a new trip? Likely yes — easy to add as a
  one-shot "copy cost items from prior trip" button.
