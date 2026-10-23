# Finances #4 — Options participant grid (v1 parity)

Part of the v2 Finances epic (#235). Also a #234 parity gap.

## What's missing
v1 had an **options grid**: every event participant as a row, every option as a column, each cell showing that member's selection. v2 has an excellent options *builder* and per-member selection, but no at-a-glance grid of everyone's picks. This is the treasurer's "who picked what / who owes what" view and a general admin convenience.

## Scope
- New admin view (under the event, near Options/Financials): roster (rows) × options (columns), each cell = the member's selection value (choice label, quantity, text, checkbox state), with the derived `$` where the option is priced.
- Column/row totals where meaningful (e.g. counts per choice, total $ per option, total owed per member).
- Handle the full option-type set (checkbox, select, multi-select, quantity, number, text, trip_cost) and the "allow none" / not-yet-answered states.
- Sensible on mobile (horizontal scroll or a condensed layout) and for large rosters (scope + paginate per the 1000-row cap rule).

## Decision for build time
Read-only first, or admin-editable cells (set/override a member's selection inline)? Lean read-only v1 for parity, add inline edit as a fast-follow if wanted.

## Acceptance
- Grid shows every on-roster member and every option with each selection + price.
- Matches the member's own Options page and the balance charges (same selection source of truth, `v2_user_option_selections`).
- Totals reconcile with the balances rollup.
