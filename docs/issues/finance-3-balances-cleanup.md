# Finances #3 — Balances page cleanup ($0 option lines + sticky save)

Part of the v2 Finances epic (#235). Small, isolated, independent of the model work — safe to ship first.

## Problems
1. **$0 clutter.** The admin balances drill-down (and the member balance view) lists a charge line for *every selected option*, including free ones — shirt size, allergies, beer, "Nope" on Long Drive — so the sheet is full of `$0` noise. Cause: `loadMemberBalance` in `src/lib/v2/balances.ts` pushes a charge for each selected option regardless of price.
2. **Save button scrolls away.** In `BalancesManager.tsx` the "Record" button sits at the bottom of the modal's scrolling body (`:217`), so it's off-screen while entering a payment.

## Fix
1. In `loadMemberBalance`, skip derived option charges priced at `$0` (they're selections, not money). Keep Trip Cost always; keep ledger charges. Mirror in `loadEventBalances` rollup math if it ever lists lines.
2. Pin the modal's action to a sticky footer (sticky bottom within `Modal` `.body`, or move it to a dedicated sticky action row) so "Record" stays visible as the content scrolls.

## Acceptance
- A member who selected only free options for the non-priced questions shows no `$0` lines — only real charges (Trip Cost, priced options, contest buy-ins, ledger charges).
- Totals (owed/paid/balance) are unchanged by the filtering.
- The "Record" button is visible without scrolling, on short and long member ledgers, on mobile.
