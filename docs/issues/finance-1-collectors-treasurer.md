# Finances #1 — Contest collectors + event treasurer + per-contest paid + Venmo buttons

Part of the v2 Finances epic (#235). Depends on the payee data model there. **Venmo only** (decided).

## Goal
Let the person setting up a contest designate **who collects** the buy-in (default = creator). At the event level, designate a **Treasurer** who is the default payee for everything, unless a contest overrides. Members pay via a prefilled Venmo button; the collector marks them paid; the contest's home card and detail page reflect paid/unpaid.

## Data
- `v2_events.treasurer_user_id` (default = creator; set in event settings; assignee must have a Venmo handle).
- `v2_contests.collected_by` (default = creator; overrides treasurer for this contest; editable post-create).
- Payee resolution + ledger `payee_user_id`/`contest_id` per the epic.

## UX
- **Contest setup/edit:** "Who's collecting?" picker, defaulting to the creator; list only members with a Venmo handle (others shown disabled with "needs Venmo").
- **Event settings:** Treasurer picker (same Venmo gate).
- **Home card (group & event contests):** for the viewer, show **Paid ✓** or a **"Pay $X" Venmo button** (prefilled via `src/lib/v2/payments.ts::venmoLink`, note = contest + event name). Reads paid state from the ledger (payment tagged to this contest).
- **Contest detail:** member sees the Venmo button + their paid state; the **collector** sees the participant roster with a **mark-paid** toggle per member (writes a ledger payment row attributed to them as payee). Mirror the inbound of the existing `MasterPayouts` "mark paid".

## Edge cases
- No eligible collector (nobody has Venmo) → prompt the creator to add a handle; block until set.
- Collector changed after some are paid → past payments keep prior attribution; future reads use the new payee.
- Member removed / refunded → paid payment becomes a credit owed back by the collector.
- Guest/non-member participants (where applicable) → no Venmo identity; cash/manual only.

## Acceptance
- A contest can be created with a non-creator collector; the event has a settable treasurer; both require Venmo.
- A member with an unpaid buy-in sees a working prefilled Venmo button on the home card and contest detail.
- The collector marks a member paid and the badge flips to Paid ✓ everywhere (home card, detail, My Money).
- Paid state is correct per-contest and feeds the unified My Money net (#2).
