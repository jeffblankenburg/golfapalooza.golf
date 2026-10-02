# v2: Options layer + per-member ledger + balances (Lane B + money)

Part of #214. Realizes #213's phases 3–4 **and** adds the per-member dimension #213's catalog model never had. This is where "adding a member to a paid contest shows up in their balance owed" actually happens.

Today in v2: buy-ins live in `v2_cost_items` as a catalog (amount per contest/side-game), the financials screen is aggregate-only, and there is **no concept of what a specific member owes** — no ledger, no paid state, nothing member-facing.

## Two new layers

### 1. Options (`v2_options` + selections) — the member-facing unit
An **Option** is an all-or-nothing, opt-in choice that may bundle **many** contests. **It can be free or paid** — opt-in does not imply a cost. A paid example: "Closest to the Pin" = one $15 line that enrolls you in all 6 daily CTP contests. A free example: an **optional Ryder Cup** ($0) — "are you playing? yes/no" — that enrolls you in the one Ryder Cup contest. Members never see the inner contests — one name, one price (consistent with the #125 rule: members see bundles, not line items).

**Every contest that is NOT in Trip Cost (`included_in_trip_cost=false`) must have an Option created to represent it to the member** — that's the whole opt-in surface. The lane is the existing #213 reconciliation bucket, not a new flag: reconcile a contest's cost_item to an Option (instead of Trip Cost) and it becomes opt-in here. Zero-cost Options are a first-class, expected case (a free optional contest is a $0 Option), not an afterthought.

- **`v2_options`**: `id, org_id, event_id, name, description, option_type (checkbox|select|multi_select|quantity), choices JSONB, sort_order, icon`. Price is **derived** from linked cost_items, never stored (matches v1 + #213 §32).
- **Trip Cost is the one derived, always-included Option**: price = `SUM(cost_items WHERE included_in_trip_cost)`. Not a row members toggle — the mandatory first line.
- **Option → contests** via the cost_items the option links (`v2_cost_items.linked_option_id`, and `v2_cost_item_option_choices` for per-choice bundles). A contest's buy-in is a cost_item; an Option groups those cost_items; selecting the Option enrolls into every contest whose buy-in cost_item the Option funds.
- **`v2_user_option_selections`** `(event_id, user_id, option_id, value JSONB)`, unique `(user_id, option_id)`.
- **`syncOptionContestEnrollment`** (port of v1 `option-contest-sync.ts`): select → upsert the member into **all** bundled contests' `v2_contest_participants`; deselect → remove from all. All-or-nothing, idempotent.

### 2. Ledger (`v2_financial_transactions`) — what each member owes
Port of v1's `financial_transactions`. Append-only; net balance derived (`SUM(payment) − SUM(charge)`).

```
v2_financial_transactions
  id, org_id, event_id
  user_id        NOT NULL → v2_profiles
  type           'charge' | 'payment'
  source         'option' | 'contest_entry' | 'manual' | 'adjustment' | 'deposit' | 'winnings' | 'credit' | 'expense'
  amount_cents   INTEGER NOT NULL (>0; direction from `type`)
  option_id      → v2_options (set when source='option')
  description, method, notes
  created_by, created_at
```

- Selecting an Option writes **one** `source='option'` charge for the Option's total (e.g. $15), **not** one per bundled contest — and enrolls into all contests (layer 1). Deselect reverses the charge + enrollment.
- Re-pricing at read time from cost_items (v1 behavior) so balances track current prices.
- Member balance is **lifetime-or-per-event** TBD in build — default per-event, matching how v1 shows a trip balance.

## UX

- **Member-facing "What you owe"**: Trip Cost (single number) + a list of Options (each a name + price + select toggle) + net balance + paid/unpaid. Never the contest breakdown behind a bundle.
- **RSVP / event page**: Options selection lives alongside attendance (selecting a paid Option is the opt-in).
- **Admin financials** (extend #213 screen): a **per-member balances tab** — everyone's charges / payments / net, scope to event attendees, drill into one member's ledger, **record a payment** / adjustment / credit (reconcile). Mirrors v1 `FinancialGrid` + ledger modal.

## Open product decision (confirm in build)
Member visibility defaults to **Options-as-single-lines** (name + price, no inner contests) per #125. If a member should instead see only a single net number with no per-option breakdown, that's a smaller variant — decide before the member view ships.

## Edge cases
- Option with zero-cost choices → no charge row.
- Changing a selection deletes the old `source='option'` charge for that option and writes the new one (no soft-delete), and re-syncs enrollment diffs.
- An attendance drop that removes a member from a *paid* option's contests must also reverse the charge — coordinate with #3.
- `included_in_trip_cost` AND `linked_option_id` on the same cost_item is invalid (reconcile to one bucket) — enforce (per #213 §30).
- Partial payments / credits fall out of the ledger for free (a $10 payment against $15 nets to −$5).

## Acceptance criteria
- Selecting the CTP Option writes one $15 charge and enrolls the member in all 6 CTP contests; deselecting reverses both.
- A member's balance = Trip Cost + selected Options − payments, shown member-facing as single lines.
- Admin can see every member's net, drill into a ledger, and record payments/adjustments.
- Trip Cost renders as the derived, always-included Option.

## v1 reference
`trip_options` (+ `option_type='trip_cost'`), `src/lib/option-contest-sync.ts`, `src/app/api/selections/route.ts`, `financial_transactions`, `src/app/api/financials/me/route.ts`, `src/components/admin/FinancialGrid.tsx`, `src/lib/cost-items/compute.ts` (read-time pricing).
