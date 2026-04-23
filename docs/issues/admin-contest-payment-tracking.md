## Overview

Organizers need a single admin view showing which Loozers have and have not paid for each contest — across the entire year, not just the active trip. This came out of the pre-event meeting: Michael wants to track who still owes for things like Super Bowl squares, trip contests, and other off-trip financial items so nothing slips through the cracks.

The underlying payment data already exists in the financial ledger; this issue is primarily about surfacing a per-contest "paid / unpaid" roster.

## User Experience

### Admin view

1. Navigate to an admin Contests area (or a new "Payments" admin tab)
2. Pick a contest from a list (or filter by trip / status / unpaid-only)
3. See a roster of participants with columns: name, amount owed, amount paid, balance, status (paid / partial / unpaid), last transaction date
4. Tap a row → drill into that user's transaction history for the contest
5. Quick filter toggle: "Show only unpaid" and "Show only paid"
6. Per-row action: mark paid (records a manual transaction), or send a Venmo reminder link

### Summary/rollups

- At top of the view: totals — total owed, total collected, total outstanding, count of unpaid participants
- Ability to view across all contests for a trip, or year-round across all contests
- Year-round view is the critical one for Sheiker's ongoing tracking (Super Bowl squares etc.)

## Technical Notes

- Data source: existing `financial_*` tables (contests, participants, transactions). Verify schema covers amount-owed vs amount-paid deltas.
- Scope permissions under an existing finance-related permission key (likely already present for admin financial views).
- Year-round vs trip-scoped: default to trip; add a "All years" toggle or trip-picker.
- Respect simulator (`getEffectiveUserId`) for consistency with other admin views.

## Acceptance Criteria

- [ ] Admin can see a list of contests with outstanding balances
- [ ] For each contest, admin sees who's paid, who's partial, who's unpaid
- [ ] Admin can filter to unpaid-only
- [ ] Admin can drill into a user's transaction history for a contest
- [ ] Year-round (non-trip) contests are included
- [ ] Totals (owed / paid / outstanding) are shown
- [ ] Works for existing financial ledger data without migration (or minimal additive migration)
