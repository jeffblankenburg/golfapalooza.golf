# Venmo/PayPal settle-up for side games & wagering

## Goal

Make settling side-game wagers frictionless: the app knows who owes whom (it already tracks the money), and hands each person a **one-tap, prefilled Venmo or PayPal payment link** so they can pay directly. Money moves peer-to-peer between people; **the app never holds or moves funds**.

## Feasibility research (why this shape, not "auto-pull and distribute")

The original vision — app automatically pulls from losers and sends to winners — is blocked on two independent fronts:

1. **No programmatic P2P API.** Venmo's consumer/P2P API has been closed to new developers since ~2016 and is effectively retired. The only sanctioned integrations are merchant pay-ins via Braintree/PayPal ("Pay with Venmo" checkout) and **approval-gated** PayPal Standard Payouts (recipient claims in Venmo). There is no way to silently debit a user or read balances. Every charge requires the payer to actively approve. (venmo.com/docs, fintechfutures)
2. **Wagering is prohibited by both AUPs.** Venmo and PayPal both ban transactions for "any activity with an entry fee and a prize" (pools, betting, etc.) for non-approved accounts. The app collecting buy-ins and distributing winnings would make us an unapproved gambling operator under their terms. (PayPal Acceptable Use Policy; Venmo User Agreement)

**Decision:** build the **settle-up links** model (Splitwise-style). The app is an information/convenience layer only. This needs no PayPal merchant account, no KYC, no money-transmitter licensing, no custody — and keeps us clear of the gambling-operator problem because friends are settling a shared golf outing directly, not transacting with an app that runs a book.

**Compliance posture (keep to these):** never hold funds; never act as payee/intermediary; only generate links and record who-said-they-paid. Frame copy around settling a shared activity, not "gambling debts."

## Two contexts, two topologies (confirmed with product)

| | One-off personal round | Event contest |
|---|---|---|
| Source of truth | `v2_round_games` (skins/nassau/etc.) | `v2_financial_transactions` ledger (#214) |
| Topology | **Mesh** — peer-to-peer among players | **Hub-and-spoke** — each member nets to one balance vs. the event treasurer |
| Settlement math | Net all games, then minimize transactions (greedy debtor/creditor) | Each member already has ONE net number; settle member ↔ treasurer |
| Trigger | After the round completes; player-driven | Admin-released by the event organizer |
| Approval step | Opt-in when a money game includes you | Enrollment already is the opt-in; admin controls release |

## Data model

- **Payment handles on `v2_profiles`** (new migration): `venmo_handle TEXT`, `paypal_handle TEXT`, optional `payout_pref TEXT` (venmo|paypal). Set in account settings. Nullable; settle-up degrades gracefully when missing (show "ask them for their handle").
- **Event treasurer/payee** (hub model): which member + handle collects/disburses the event pot. Likely `v2_events` column or event settings (`treasurer_user_id`). The organizer by default.
- **Settlement records:**
  - Event: reuse `v2_financial_transactions` — a `payment` row with `method='venmo'|'paypal'` records a member settling; the schema already supports this (`type`, `source`, `method`). Add a lightweight "settlement intent/confirmed" state if we want a requested→paid→confirmed lifecycle.
  - Personal round: add a small `v2_round_game_settlements` (or a `settled_at`/`settled_method` on a per-pair row) since round games have no ledger. TBD in design.

## Link generation

- **Venmo deep link:** `https://venmo.com/?txn=pay&audience=private&recipients=<handle>&amount=<amt>&note=<note>` (opens app on mobile, web fallback). Validate/normalize handles.
- **PayPal:** `https://paypal.me/<handle>/<amount>`.
- Prefill amount + a note ("Golfapalooza skins, 6/14"). Note: links can't be forced private/verified — see trust gap below.

## Settlement computation

- **Mesh (personal):** sum every game into a net per player, then greedy min-cash-flow (largest creditor ↔ largest debtor) to minimize the number of payments. Netted across the whole round per the product decision.
- **Hub (event):** the ledger already nets each member to a single balance; net-negative members pay the treasurer, treasurer pays net-positive members. No cross-member links.

## UX flows

1. **Account setup** — add Venmo/PayPal handle(s) in profile/account. One-time.
2. **Inclusion/approval** — when a money game includes you (personal round), confirm you're in the money pool (your requested approval step). Event enrollment already serves as opt-in.
3. **Settle-up screen** —
   - "You owe **@winner $12** → [Pay with Venmo] [Pay with PayPal]" (one tap, prefilled).
   - "You're owed **$8 from Dave**" → [Send a reminder] (Venmo request link / nudge notification).
   - **Mark as paid** / **Mark as received** (manual, both sides can confirm — see trust gap).
4. **Notifications** — personal: fire on round completion to each player. Event: fire when the admin releases settle-up.

## Trust gap (important)

Because there's no Venmo API, the app **cannot verify a payment actually happened**. Settlement is self-reported: payer taps "I paid," payee confirms "received." Model a `requested → paid → confirmed` lifecycle and surface unconfirmed items. This is the same limitation Splitwise has; acceptable for a friends' app.

## Phasing

- **P1:** profile payment handles + personal-round mesh settle-up (net-minimized) + one-tap Venmo/PayPal links + mark-paid/confirm.
- **P2:** event hub settle-up (admin release, treasurer config, ledger `payment` rows, member↔treasurer links).
- **P3:** request-money nudges, reminders, settle-up status dashboard, reconciliation polish.

## Explicitly out of scope

- App custody of funds, auto-debit, escrow, holding a pot.
- Acting as a payment facilitator / gambling merchant.
- Guaranteed/verified payment confirmation (no API exists).

## Open questions

- Event treasurer: always the organizer, or configurable per event? What if the pot is split across multiple payees (v1 had cash denominations per payout sheet)?
- Personal-round settlements storage: new table vs. columns on an existing one.
- Minimum-viable handle validation (Venmo usernames change; no lookup API).
- Do we want PayPal "request money" links for the owed side, or just reminders?
- International/other rails (Cash App, Zelle) — deferred; Venmo+PayPal first.
