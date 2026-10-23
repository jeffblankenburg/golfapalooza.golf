# Finances #2 — Group-level finances + unified "My Money" + settle-up

Part of the v2 Finances epic (#235). **Unified "My Money"** (decided). **Venmo only.**

## Problem
Balances are strictly **event-scoped** today (`loadEventBalances` / `loadMemberBalance`), so **group-level contests (`event_id IS NULL`) with buy-ins have no balance surface at all** — that money is invisible. And a member has no single place to see everything they owe / are owed across the group and its events, especially once money goes to *different* collectors.

## Goal
1. **Ledger goes group-scopeable** (`org_id` + nullable `event_id` + `payee_user_id`, per the epic) so group-contest money has a home.
2. **Unified "My Money"** member screen (replaces the per-event member balance page): the member's total net, plus a breakdown **grouped by payee** — "You owe Whitey $15 [Venmo]", "You owe the Treasurer $705 [Venmo]", and incoming "Randy owes you $20" when the member is a collector. Aggregates across every event + group contest. Each payee line has a Venmo settle-up button for the net.
3. **Group-level admin financial view** alongside the existing per-event financials: an org-wide rollup across all events + group contests (per-member balances, per-payee flows). Keep the per-event admin financials as the event-scoped slice.

## UX
- My Money: top summary (You owe / You're owed / Net), then per-payee cards with the lines that make them up and a single Venmo button for that payee's net. Settled payees collapse.
- Group admin financials: member × balance grid (owed/paid/net) spanning events + group; drill into a member to see obligations by payee and record payments.
- Reuse `venmoLink`; note text identifies what's being settled.

## Edge cases
- Payee = viewer → excluded (no self-debt).
- A member who is both a debtor and a collector → shows both directions.
- Changing treasurer/collector → historical attribution preserved (ledger rows).
- Cross-event aggregation must respect the 1000-row cap (scope + paginate).
- Derived charges (Trip Cost/options) remain event-scoped and resolve to that event's treasurer.

## Acceptance
- A group contest buy-in appears in the owing member's My Money attributed to the right collector (it currently appears nowhere).
- My Money nets correctly per payee across multiple events + group contests; each Venmo button is prefilled with the net and a clear note.
- The group admin view reconciles with the sum of per-event views + group contests.
- Marking a payment (via #1 or the admin view) updates My Money immediately.
