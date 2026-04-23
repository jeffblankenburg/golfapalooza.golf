## Overview

Sheiker has to hand out cash payouts for dozens of contests at the awards banquet. Calculating the optimal mix of bill denominations (100s, 50s, 20s, 10s, 5s, 1s) by hand is tedious and error-prone. Build a tool that takes the list of payouts for a trip and returns the best denomination breakdown — both overall (total cash to bring) and per-envelope (what goes in each winner's envelope).

## User Experience

### Admin view

1. Navigate to a new "Payouts" admin view (or a section inside the financial admin)
2. See a list of every contest with its payout amounts and winners
3. Top-level summary: "Bring N × $100, M × $50, ..." — optimal total cash mix
4. Per-envelope view: each winner's name + the bill breakdown for their envelope (e.g., "John Smith — $135 = 1×$100 + 1×$20 + 1×$10 + 1×$5")
5. Configurable preferences:
   - Prefer larger bills (default) vs. prefer change-friendly mix
   - Exclude certain denominations (e.g., "I don't want to carry 1s")
6. Export/print-friendly version for Sheiker to reference at the ceremony

### Edge cases

- Amounts that can't be made without excluded denominations: flag clearly
- Negative / zero payouts: exclude
- Unresolved contests (no winner yet): show as "pending" in a separate section

## Technical Notes

- Pure computation — greedy change-making algorithm (always optimal with standard US denominations)
- Reads from `contest_winners` / `financial_*` tables
- No new database needed beyond read-only queries
- Settings: store user preferences (excluded denoms, mix strategy) in local storage or as a simple admin pref

## Acceptance Criteria

- [ ] Admin sees total cash needed with bill breakdown
- [ ] Each winner's envelope has an exact breakdown
- [ ] Denominations can be excluded (e.g., no 1s)
- [ ] Unresolved contests are called out separately
- [ ] Output is print/export-friendly
- [ ] Works across all contest types (Calcutta, skins, daily games, 100 Feet, etc.)
