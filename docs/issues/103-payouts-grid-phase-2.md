# Feature: Loozer × contest payout grid (Phase 2 of #103)

## Overview

Phase 1 of #103 shipped the cash-planning side: an admin-editable
`payout_sheet_events` config and a denomination calculator on
`/admin/financials/grid` (the "Payout Denominations" tab). Phase 2 builds the
upper grid the original issue described: rows = Loozers, columns = contests,
cells highlighted with payout amounts when a winner is declared, and a
per-cell "paid" checkbox so Sheiker can track payouts during the awards
banquet.

**Reads winners from existing data — no duplicate winner entry.** The grid is a
viewer + paid-status tracker on top of the systems that already store winners.

## Data sources per column

| Column | Winner source | Cell math |
|---|---|---|
| Thu/Fri/Sat Team | `contest_winners` joined via `calcutta_prizes.linked_contest_id` to the scramble; place 1 vs place 2 distinguished | Pot = `scramble_participant_count × $10`. **2nd place team gets a flat $80.** **1st place team gets `pot - 80`.** Per-member cell = team payout ÷ team_size (3/4/5 players supported). |
| Thu/Fri/Sat Skins | skins computation (`/api/skins` per scramble) | Per team: `(team.skins / totalSkins) × pot`; per member: team share ÷ team_size |
| Thu/Fri/Sat Par 3 | `daily_contest_winners` (`ctp_front`, `ctp_back`) per day | One winner per day per type; cell amount from config |
| Bro LD | `daily_contest_winners` (`long_drive`) per day | One winner per day; cell amount = $5 |
| Bro LP | `daily_contest_winners` (`long_putt`) per day | One winner per day; cell amount = $5 |
| 100 ft. | event-level: lowest cumulative `hundred_feet_scores` total | Single winner; full event payout |
| PickEm | derive from pickem rankings + `pickem_settings.payout_json` | 1st/2nd/3rd per the configured percentages × pot |

Excluded: Boland (paid live on the course), KGB Cup (no payouts), Lodge nights
(pass-through cash, not a payout).

## New table: `payout_paid_status`

Tracks the per-cell "paid" checkbox. Pickem keeps using its existing
`pickem_payouts.paid_out` (read-through); everything else writes here.

```sql
CREATE TABLE payout_paid_status (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL REFERENCES trip_settings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Soft key tying this cell to a specific event slot. Format:
  --   "scramble:<contest_id>:team"    — Friday Team payout
  --   "scramble:<contest_id>:skins"   — Friday Skins payout
  --   "daily:<trip_id>:<day>:<type>"  — CTP/LD/LP per-day cells
  --   "hundred_feet:<trip_id>"        — 100 ft event-level
  cell_key VARCHAR(100) NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES users(id),
  UNIQUE (trip_id, user_id, cell_key)
);
```

(Soft cell_key keeps the table generic without a forest of FKs to per-contest
tables.)

## Read API

`GET /api/admin/financials/payout-grid?trip_id=...` returns a unified shape:

```ts
{
  loozers: { user_id, display_name, avatar_url }[],         // rows
  events: {                                                 // columns
    key: string,                                            // matches cell.event_key
    label: string,                                          // "Thursday Team"
    is_payout: boolean
  }[],
  cells: {
    user_id, event_key, amount, paid: boolean, paid_at: string|null
  }[]
}
```

The aggregator joins the existing winner sources, applies per-cell math, and
overlays paid-status from `payout_paid_status` (and `pickem_payouts` for
PickEm).

## Write API

`PUT /api/admin/financials/payout-grid/cell` — toggle paid:

```ts
{ user_id, cell_key, paid }
```

For Pickem cells, writes to `pickem_payouts`. For all others, upserts
`payout_paid_status`. Permission: `manage_finances`.

## UI

New tab on `/admin/financials/grid` (or new page at
`/admin/financials/payout-grid`) showing the grid:

- Sticky first column = Loozer name + avatar
- Sticky header row = column labels with column total at the top
- Cells with no winner: blank
- Cells with winner: highlighted, shows `$amount`, has a checkbox that toggles
  paid status; checked cells dim and show a check icon
- Sortable by Loozer name or column total
- Print-friendly view (envelope cheat sheet)

## Scoping resolved

- **Scramble Team payout split**: 2nd place gets a flat **$80**, 1st place gets **`pot − $80`** where pot = `participant_count × $10`. Independent of any Calcutta percentages even though the DB still carries them.
- **Skins per-member math**: team share ÷ team_size. Variable team sizes (3/4/5) supported.

## Acceptance Criteria

- [ ] Grid renders attending Loozers in rows, configured payout events in columns
- [ ] Cells light up with the right $ amount when a winner exists in the source data
- [ ] Variable scramble team sizes (3/4/5) handled correctly in per-member splits
- [ ] Paid checkbox per cell, persists in `payout_paid_status` (or `pickem_payouts` for Pickem)
- [ ] No duplicate winner entry — every winner read from existing sources
- [ ] Print view shows the envelope cheat sheet

## Dependencies

- Builds on #103 Phase 1 (config table) — already shipped.
