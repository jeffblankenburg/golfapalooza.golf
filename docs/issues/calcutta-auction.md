# Feature: Calcutta Auction System

## Overview

Build a full Calcutta auction system with two major components:
1. **Display Screen** — A projector-friendly, NFL Draft-style display for 40 guys watching a 10-foot screen in a parking lot
2. **Admin Management** — Auction order curation, live bid entry, and prize breakdown configuration

## Problem Statement

The Calcutta auction is a core evening event (Day 2, 7:30-9:00 PM). Each Loozer is auctioned off to the highest bidder. The total auction pool funds the prize payouts for multiple contests. Currently the Calcutta page is a placeholder.

## User Experience

### Display Screen (`/calcutta/display`)

**Pre-Auction State:**
- Left column: scrollable list of all participants in auction order
- Main area: prize breakdown by percentage (e.g., "BSPITW 1st: 40%, BSPITW 2nd: 20%, Scramble Day 1: 10%...")
- Dollar amounts are unknown until the auction ends — show only percentages

**During Auction — Active Lot:**
- Left column: participant list with status indicators
  - Pending (upcoming): name only
  - Active (currently being auctioned): highlighted/pulsing
  - Sold: name + bid amount + owner name
- Main area (hero spotlight):
  - Large photo (avatar_url)
  - Display name / nickname prominently
  - Age (calculated from birthday field if available)
  - Playing partners for upcoming contests (scramble team members for Days 2-4)
  - Historical accolades/wins from past trips
  - Animated entrance feel

**Post-Auction State (all lots sold):**
- Left column: all participants with bid amounts and owners
- Main area:
  - Total auction pool (sum of all bids)
  - Prize breakdown in dollars (total × percentage for each contest/place)
  - Grand, celebratory feel

### Admin Management (`/admin/events/[tripId]` — CalcuttaManager component)

**Auction Setup (pre-auction):**
- Drag-and-drop reordering of participant auction order
- Configure prize breakdown percentages (contest name + place + percentage)
  - Example: "BSPITW 1st — 40%", "BSPITW 2nd — 15%", "Scramble Day 1 — 10%"
  - Percentages should sum to 100% (with validation warning if not)
  - Some contests pay 1st only, some pay 1st and 2nd

**Live Auction Management:**
- Shows current participant being auctioned (auto-advances)
- Input field for final bid amount (dollar value)
- Dropdown to select owner (any participant — including self-purchase)
- "Save & Next" button to record the bid and advance to the next lot
- Ability to go back and edit a previous bid if needed
- Running total of auction pool

## Technical Implementation

### Database Schema

New migration `00035_calcutta_auction.sql`:

```sql
-- Calcutta auction lots (one per participant being auctioned)
CREATE TABLE public.calcutta_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  auction_order SMALLINT NOT NULL,
  bid_amount DECIMAL(10,2),
  owner_id UUID REFERENCES public.users(id),
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(contest_id, user_id),
  UNIQUE(contest_id, auction_order)
);

-- Calcutta prize breakdown configuration
CREATE TABLE public.calcutta_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  prize_name VARCHAR(100) NOT NULL,
  place SMALLINT NOT NULL DEFAULT 1,
  percentage DECIMAL(5,2) NOT NULL,
  sort_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track which lot is currently active
ALTER TABLE public.contests ADD COLUMN IF NOT EXISTS calcutta_active_lot SMALLINT;
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/calcutta?contest_id={id}` | Get all lots, prizes, and active lot |
| PUT | `/api/admin/calcutta/lots` | Create/reorder lots |
| PUT | `/api/admin/calcutta/lots/bid` | Record bid (amount + owner) and advance |
| PUT | `/api/admin/calcutta/active` | Set the active lot number |
| GET | `/api/admin/calcutta/prizes?contest_id={id}` | Get prize breakdown |
| POST | `/api/admin/calcutta/prizes` | Create/update prize percentages |
| DELETE | `/api/admin/calcutta/prizes?id={id}` | Delete a prize entry |
| GET | `/api/calcutta/display?contest_id={id}` | Public display data (lots, prizes, active, user details) |

### Components

1. **`CalcuttaManager`** (`src/components/admin/CalcuttaManager.tsx`)
   - Auction order setup with drag-and-drop
   - Prize breakdown editor
   - Live auction controls

2. **`CalcuttaDisplay`** (`src/components/calcutta/CalcuttaDisplay.tsx`)
   - Full-screen projector display
   - Participant sidebar
   - Hero spotlight area
   - Auto-refresh via polling (every 3-5 seconds)

3. **Display Page** (`src/app/(app)/calcutta/display/page.tsx`)
   - Clean, full-screen layout (no nav bars)
   - Designed for 16:9 projector

### Data Sources for Display

- **Photo**: `users.avatar_url`
- **Nickname/Name**: `users.display_name`
- **Age**: Calculated from `users.birthday`
- **Playing Partners**: Query `scramble_team_members` joined through `scramble_teams` for the same trip's scramble contests
- **Historical Wins**: Query `accolades` for the user across all trips

## Edge Cases

- Participant has no photo → show large initial/placeholder
- Participant has no birthday → don't show age
- No accolades → skip that section on the spotlight
- No scramble teams assigned yet → show "Teams TBD"
- Admin refreshes mid-auction → resume at correct active lot
- Prize percentages don't sum to 100% → show warning but allow saving
- Self-purchase → owner_id === user_id is valid

## Acceptance Criteria

- [ ] Admin can set auction order by dragging participants
- [ ] Admin can configure prize breakdown percentages
- [ ] Admin can run the auction: enter bids, select owners, advance lots
- [ ] Display screen shows participant list with sold/pending/active states
- [ ] Display screen hero area shows active participant's details
- [ ] Display screen shows prize percentages pre-auction
- [ ] Display screen shows dollar amounts post-auction
- [ ] Display auto-updates when admin makes changes (polling)
- [ ] Display works well on a 16:9 projector (landscape, large text)
- [ ] All data persists — admin can close and reopen without losing state
