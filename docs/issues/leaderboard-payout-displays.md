# Feature: Display payout amounts on contest leaderboards

## Overview

Issue #103 introduces `payout_sheet_events` as the canonical, admin-editable
config for per-event payout amounts on a trip. Once that ships, contest
leaderboards across the app should surface the payout amount next to the winner
(or the per-place split, where applicable), all sourced from the same config —
no more hardcoded dollar values.

## Pages to update

Each page below already exists and renders a leaderboard or winner display, but
does not currently surface the payout amount.

| Page | Route | Events sourced from config |
|---|---|---|
| Daily Games | `/daily-games` | CTP Front, CTP Back, Long Drive, Long Putt — per day |
| Hundred Feet | `/hundred-feet` | 100 Feet — single pot |
| Contests / Boland | `/contests` (or wherever Boland lands) | Boland Bet — single payout |

Calcutta (`/calcutta`) and Pick'em (`/whitey`) are intentionally **out of scope**
— each maintains its own admin-editable payout system (`calcutta_prizes.percentage`
and `pickem_settings.payout_json`). They are not migrated to the unified config.

## Skins note

Skins is already wired in #103 (the only existing leaderboard with a hardcoded
$10 figure). No additional work required here.

## Acceptance Criteria

- [ ] Daily Games shows the per-day payout next to each winner (e.g., "Long Drive — $X to winner")
- [ ] Hundred Feet shows the pot total and winner payout
- [ ] Boland has a public-facing winner display with payout
- [ ] All amounts come from `payout_sheet_events` rows for the active trip
- [ ] When the admin edits a row in `/admin/financials/payout-events`, the
      leaderboards reflect the change without code redeploy
- [ ] When a row is missing for a given event (admin hasn't configured it yet),
      the leaderboard hides the payout figure rather than showing $0

## Dependencies

- Blocked by #103 (config table + admin page must ship first)
