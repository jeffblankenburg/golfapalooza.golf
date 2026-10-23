# Epic: v2 Finances — payees, treasurer, unified "My Money" + Venmo settle-up

**Status:** spec for review (no code yet). Decisions locked: **Venmo only**; one **unified "My Money"** member screen; **spec everything first**.

## The core shift

Today v2 money is **one pot per event**: every charge (Trip Cost, options, contest buy-ins) rolls up into a single `owed / paid / balance` per member, and payments are ledger rows not tied to *who collects them* or *what they're for* (`src/lib/v2/balances.ts`, `v2_financial_transactions`). That can't express "pay Whitey $15 for CTP, the treasurer $705 for the trip."

This epic attaches a **payee** to every obligation and tracks payment **per payee**, so a member's money becomes "who do I owe, who owes me, settle up with each." #1 and #2 below are two faces of the same change.

**Hard constraint:** Venmo/PayPal give **no payment confirmation** (no API callback — same reason #221 is "links only, no custody"). So "paid" is **never automatic** — a member taps a prefilled Venmo link; the **collector/treasurer marks them paid**. Every paid badge is ultimately that human action.

## Data model (proposed)

- **`v2_events.treasurer_user_id`** (UUID, nullable → defaults to event creator) — the default payee for event-scoped obligations (Trip Cost, options, event contest buy-ins, manual charges). Set in event settings. App-enforced: assignee must have a Venmo handle.
- **`v2_contests.collected_by`** (UUID, nullable) — overrides the treasurer for *this contest's* buy-in. Default = contest creator. Editable post-create (per "admins edit anything anytime"). For a **group** contest (`event_id IS NULL`) there is no treasurer, so the payee = `collected_by ?? created_by`.
- **`v2_financial_transactions`** gains **`org_id`** (NOT NULL) + **`event_id` becomes nullable** (so group-contest money has a home) + **`payee_user_id`** (who received the money) + optional **`contest_id`** (what it was for). This makes the ledger the single source of truth for payments across event AND group scope.

### Payee resolution (one helper, reused everywhere)
```
contest buy-in (event)   → contest.collected_by ?? event.treasurer_user_id ?? contest.created_by
contest buy-in (group)   → contest.collected_by ?? contest.created_by
trip cost / options /    → event.treasurer_user_id ?? event.created_by
  manual event charge
```

### Obligations (derived) + "paid"
- A member's **obligations** = derived charges (Trip Cost + selected options, per event) + **contest buy-ins** for every contest they're enrolled in (event or group) + ledger charges. Each carries a resolved **payee**.
- **"Paid" is derived from the ledger, not a separate flag:** a payment is a `v2_financial_transactions` row tagged with `payee_user_id` (+ `contest_id` when it's a contest buy-in). "Paid for contest X" = a payment row exists for (member, contest X). "Mark paid" = the collector inserts that row (method = Venmo/cash/…). No bespoke per-participant boolean — keeps one source of truth and makes the My Money rollup natural.
- **Net per payee:** for each payee, `sum(obligations to that payee) − sum(payments to that payee)` = the net the member owes (or, if negative, is owed). The Venmo button pays that net.

### Reconciliation to settle during build
Some contest fees are modeled today as **Options** (pickem/boxes fee bundled as an Option per `project_v2_pickem`), others as **`contests.buy_in_cost_item_id`**. The obligations layer must unify "what a member owes for a contest" across both so a buy-in appears exactly once with the right payee. Decide: converge contest fees onto `buy_in_cost_item_id` + payee, OR teach the obligations resolver to read both. (Lean: one path — buy_in_cost_item_id + payee — and migrate the option-fee contests.)

## Sub-issues
- [ ] #236 — Contest collectors + event treasurer + per-contest paid + Venmo buttons
- [ ] #237 — Group-level finances + unified "My Money" + settle-up
- [ ] #238 — Balances page cleanup ($0 option lines + sticky save) *(independent, safe to ship first)*
- [ ] #239 — Options participant grid (v1 parity)

## Cross-cutting edge cases
- Collector/treasurer without a Venmo handle → block assignment, prompt them to add one.
- Payee == the member → you don't owe yourself; suppress that line.
- A collector who is *owed* money → "My Money" shows incoming too ("Owed to you: Randy $20").
- Changing a collector/treasurer after payments exist → past payments stay attributed to the prior payee (they're ledger rows); only future obligations re-resolve.
- Removing a member from a contest / refund → the obligation disappears; any recorded payment flips to a credit (owed back by the collector).
- Venmo handle edits → links rebuild (username stored bare, no @).
- Self-reported "I paid" vs collector confirmation → v1-style, collector-confirmed only for v1; optional member "I sent it" nudge is a later nicety.
- Out of scope: PayPal (deferred — link builder already exists), multi-currency, non-US Venmo, auto-reconciliation.

## Relationships
Builds on #213 (cost_items spine), #214 (two-lane enrollment + ledger), #221 (settle-up links, no custody). Part of the #234 parity push (#3/#4 are listed parity gaps).
