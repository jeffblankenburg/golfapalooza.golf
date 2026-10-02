v2 financial management — the universal money system for an event. Ports v1's `cost_items`-as-source-of-truth model into the `v2_`-prefixed world. Related: the contests/side-games work (#209) that produces buy-ins.

## Model (decided)

**`v2_cost_items` is the single source of truth for every dollar** in an event — contest buy-in, side-game buy-in, lodging, meals, shirts, an option's entry fee. Nothing else stores an amount as truth; cost-bearing things point at a cost_item. **The buy-in field on a contest/side game writes to its linked cost_item** (one number, no sync drift).

Each cost_item reconciles to **exactly one** bucket:
- **Trip Cost** (`included_in_trip_cost=true`) — folded into the single base price every on-roster member pays. Members only ever see "Trip Cost: $X"; the line-item breakdown is **admin-only** (v1 rule).
- **An Option** (`linked_option_id`) — opt-in add-on; only members who select it pay.
- **Unreconciled** — tracked for budgeting, not charged (operational / pass-through).

## Schema

### `v2_cost_items`
```
id              UUID PK
org_id          UUID NOT NULL → v2_organizations ON DELETE CASCADE
event_id        UUID NOT NULL → v2_events        ON DELETE CASCADE
name            TEXT NOT NULL
amount_cents    INTEGER NOT NULL DEFAULT 0
category        TEXT          -- contest | side_game | lodging | food | shirts | operational | pass_through | other
included_in_trip_cost BOOLEAN NOT NULL DEFAULT false
linked_option_id UUID → v2_options(id) ON DELETE SET NULL   -- (nullable; added with options phase)
source_type     TEXT          -- 'manual' | 'contest' | 'side_game' | 'lodging' | …
source_id       UUID          -- the owning row (e.g. the contest); NULL for manual
sort_order      INTEGER NOT NULL DEFAULT 0
notes           TEXT
created_by, created_at, updated_at
```
Permissive RLS + API-gated admin writes; members may read (but UI never shows the breakdown to non-admins). A cost_item with `included_in_trip_cost` AND `linked_option_id` is invalid — reconcile to one bucket.

### `v2_options` (later phase)
Event add-ons members opt into (`option_type`: checkbox / select / multi_select / quantity / …) + the special **trip_cost** derived option = `SUM(cost_items WHERE included_in_trip_cost)`. Each option's price derives from its linked cost_items.

## How contests + side games feed in (phase 2)
A contest/side-game buy-in = a cost_item (`source_type='contest'|'side_game'`, `source_id`). The contest's buy-in input creates/updates that cost_item; deleting the contest deletes it. `entry_amount_cents` added in #209 becomes the cost_item amount (migrate/retire it).

## Financial management screen — `/admin/events/[eventId]/financials`
One reviewable, editable table of every cost_item for the event:
- Grouped by category; each row editable: name, **amount**, category, reconciliation (Trip Cost / Option / none).
- Headline totals: **Trip Cost** (sum of included), each **Option** total, grand total.
- Add **manual** cost items; auto items (contest/side-game) show + link to their source.

## Phases
1. **`v2_cost_items` + financial screen** (aggregate, add/edit/delete manual items, Trip Cost total). ← building first.
2. **Contest/side-game buy-ins → cost_items** (appear + reconcile; retire `entry_amount_cents`).
3. **`v2_options`** (opt-in add-ons) + RSVP selection + per-option totals.
4. **Payouts / denominations** (separate later epic — ports v1 payout_sheet_events / denominations / contest_winners payout).

## Decisions (locked)
- cost_items owns the amount (single source of truth; consumers link).
- Build the financial screen + schema first, then wire contests, then options, then payouts.
