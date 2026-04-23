## Overview

Financial transactions have a `notes` field (e.g., "Paid via Venmo for skins entry"), but today it's only visible to admins. Regular users viewing their own financial history can't see the context of each transaction, which leads to confusion ("what was this $20 for?").

Make transaction notes visible on the user's own financial history page.

## User Experience

### On the user's own financial history

1. Each transaction row shows amount, date, and the note
2. Notes are visible for ALL of the user's own transactions
3. No visibility change for other users' transactions (privacy)

### Admin

- No change — admins already see notes everywhere

## Technical Notes

- Find the transaction-history UI rendered for non-admins and include the `notes` field in its select and display
- Confirm RLS already scopes to the user's own rows (should be the case)
- Verify no sensitive admin-only text leaks through (e.g., internal reconciliation notes). If that's a concern, add a separate `user_visible_notes` column, but the simpler path is to just show `notes` — the assumption is that admins write notes with users in mind.

## Acceptance Criteria

- [ ] User sees the note on each of their own transactions
- [ ] Formatting is readable on mobile (truncate-with-expand if long)
- [ ] No change to admin view
- [ ] No leak of other users' transaction notes
