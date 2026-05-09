# Issue #103 — Payout Denominations Tab

New tab on `/admin/financials/grid` that mirrors the workbook's "Options" sheet
cash-needed grid. Tells Sheiker how much cash to bring (broken into bill
denominations) for the trip.

**Out of scope:**
- Calcutta — has nothing to do with this tool.
- Cornhole singles + doubles — no payouts, exclude entirely.

## Per-event cash math

Source = where the participant list / count comes from.

| Workbook column | Source | Per-participant amount | Notes |
|---|---|---|---|
| Thu Team | scramble entry-fee earmark | $10/player | Part of trip cost; one earmark per scramble day |
| Fri Team | scramble entry-fee earmark | $10/player | |
| Sat Team | scramble entry-fee earmark | $10/player | |
| Thu Skins | scramble entry-fee earmark | $10/player | Part of trip cost; one earmark per scramble day |
| Fri Skins | scramble entry-fee earmark | $10/player | |
| Sat Skins | scramble entry-fee earmark | $10/player | |
| Thu Par 3 (CTP) | options "Closest To The Pin" (yes) | $5/player/day | Cost in options is $15 = 3 days × $5 |
| Fri Par 3 (CTP) | options "Closest To The Pin" (yes) | $5/player/day | |
| Sat Par 3 (CTP) | options "Closest To The Pin" (yes) | $5/player/day | |
| ~~MELC~~ | — | — | **Excluded — legacy event** |
| ~~Boland~~ | — | — | **Excluded — paid live on the course** |
| Practice (KGB Cup) | options "KGB Cup" (yes, $55) | $55/participant | **Not a payout** — cash to *pay for the event*. No prize. |
| Bro LD (Long Drive) | options "Long Drive Contest" (yes, $15) | $5/player/day | 3 days × $5 |
| Bro LP (Long Putt) | every attendee, automatic | $5/player/day | Not from options — everyone is in |
| 100 ft. | options "100 Feet!" (yes, $10) | $10/participant | Single payout |
| PickEm | `pickem_settings` + `pickem_payments` | derived | Pot = entry_fee × paid participants; split via `payout_json` structure |
| Lodge Mon | options "Extra Hotel Nights" → $145 selectors | $65/participant | Mon = ($145 - $80) implied |
| Lodge Tue | options "Extra Hotel Nights" → $145 OR $80 selectors | $80/participant | Both options include Tue |

## All event math resolved

(See table above. MELC excluded as legacy.)

## Trip option IDs (active trip)

`trip_id = 1de37153-4c81-44f6-aa42-ecbc0653ff21` — Golfapalooza XXX (2026)

| Option name | Type | Yes-cost | Used for |
|---|---|---|---|
| KGB Cup | select yes/no | $55 | Practice Round column (cash needed, no payout) |
| Boland Bet | select yes/no | $10 | Boland column |
| Closest To The Pin | select yes/no | $15 | Par 3 (CTP) Thu/Fri/Sat |
| Long Drive Contest | select yes/no | $15 | Bro LD Thu/Fri/Sat |
| 100 Feet! | select yes/no | $10 | 100 ft. column |
| Whitey's CFB Pick'em | select yes/no | $20 | PickEm column |
| Extra Hotel Nights | select | $145 (Mon+Tue) / $80 (Tue) | Lodge Mon, Lodge Tue |

## Architecture note

Reading from existing data, no duplicate winner entry:
- Participants per event come from `user_option_selections` filtered to the
  trip's relevant `trip_options`.
- Scramble earmark and Long Putt are not options — derived from trip attendance.
- Payouts are pure derivation from participant count × per-player amount; no new
  table needed for the planning view.
- A small table may still be needed for tracking *which winner got paid* (the
  paid-checkbox part of the grid). Defer until winners scope is locked.
