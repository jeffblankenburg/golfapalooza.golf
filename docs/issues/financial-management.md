## Overview

Golfapalooza needs a financial management system to track and manage the costs, payments, and balances for every participant across the entire trip. This includes entry fees, lodging costs, Calcutta auction amounts, and any other shared expenses. Currently there is no financial infrastructure in the app at all.

## Problem Statement

Tracking who owes what, who has paid, and what the total costs are is currently done manually outside the app. This leads to confusion, errors, and a lot of back-and-forth. We need a centralized, transparent system that both admins and participants can reference.

## User Experience

### For Participants (Loozers)
- See their personal balance on the home page or a dedicated "Financials" page
- View an itemized breakdown of what they owe (entry fee, lodging, Calcutta bids, etc.)
- See what they've already paid
- Know exactly how much they still owe (or are owed, if they overpaid)

### For Admins
- Define cost categories for the trip (e.g., "Entry Fee", "Lodging", "Food & Beverage", "Calcutta Buy-In")
- Set per-person costs (flat fees that apply to all participants) or individual charges
- Record payments received from each participant (cash, Venmo, check, etc.)
- Track Calcutta auction results — which teams were bought by which Loozers, and for how much
- View a master ledger showing all participants, their total charges, total payments, and outstanding balance
- Export or share a summary for transparency

## Technical Implementation Plan

### Database Schema

#### `trip_cost_categories`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| trip_id | uuid | FK to trip_settings |
| name | text | Category name (e.g., "Entry Fee") |
| description | text | Optional description |
| default_amount | numeric | Default per-person amount (nullable) |
| sort_order | int | Display order |

#### `user_charges`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| trip_id | uuid | FK to trip_settings |
| user_id | uuid | FK to users |
| category_id | uuid | FK to trip_cost_categories (nullable for misc charges) |
| description | text | Line item description |
| amount | numeric | Charge amount (positive = owes, negative = credit) |
| created_by | uuid | Admin who created the charge |
| created_at | timestamptz | When the charge was created |

#### `user_payments`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| trip_id | uuid | FK to trip_settings |
| user_id | uuid | FK to users |
| amount | numeric | Payment amount |
| method | text | Payment method (cash, venmo, check, etc.) |
| notes | text | Optional notes |
| recorded_by | uuid | Admin who recorded the payment |
| created_at | timestamptz | When the payment was recorded |

#### `calcutta_bids`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| trip_id | uuid | FK to trip_settings |
| contest_id | uuid | FK to contests (the Calcutta contest) |
| team_id | uuid | FK to scramble_teams (the team being auctioned) |
| buyer_id | uuid | FK to users (who bought the team) |
| bid_amount | numeric | Winning bid amount |
| created_at | timestamptz | When the bid was recorded |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/financials?trip_id={id}` | Master ledger: all users with charges, payments, balances |
| POST | `/api/admin/financials/categories` | Create a cost category |
| PUT/DELETE | `/api/admin/financials/categories` | Update/delete a cost category |
| POST | `/api/admin/financials/charges` | Add a charge to one or all users |
| DELETE | `/api/admin/financials/charges` | Remove a charge |
| POST | `/api/admin/financials/payments` | Record a payment |
| DELETE | `/api/admin/financials/payments` | Remove a payment |
| GET | `/api/financials` | Current user's balance and line items |
| GET | `/api/admin/calcutta/bids?trip_id={id}` | List all Calcutta bids |
| POST | `/api/admin/calcutta/bids` | Record a Calcutta bid |
| DELETE | `/api/admin/calcutta/bids` | Remove a Calcutta bid |

### UI Components

#### Admin: `FinancialManager.tsx`
- Cost category management (CRUD)
- Bulk charge assignment (e.g., apply entry fee to all participants)
- Individual charge/payment recording
- Master balance table with search/sort
- Calcutta auction recording interface

#### Admin: `CalcuttaAuctionManager.tsx`
- List all scramble teams available for auction
- Record winning bids with buyer and amount
- Auto-generate charges in `user_charges` from bids

#### User-Facing: `MyFinancials.tsx` or home page card
- Balance summary (total owed, total paid, remaining)
- Itemized breakdown by category
- Payment history

## Edge Cases & Considerations

- Calcutta bids should auto-create corresponding entries in `user_charges` so the balance is always in sync
- Support for splitting costs (e.g., a Calcutta team bought by multiple Loozers splitting the bid)
- Admin should be able to apply a charge to all participants at once (e.g., flat entry fee)
- All financial mutations should be logged with who made the change and when (audit trail)
- Consider a `show_financials` toggle on `trip_settings` to control visibility
- Negative balances (credits/refunds) should be supported
- Currency is always USD, no need for multi-currency support

## Acceptance Criteria

- [ ] Admin can create cost categories for a trip
- [ ] Admin can add charges to individual users or all participants at once
- [ ] Admin can record payments with method and notes
- [ ] Admin can record Calcutta auction bids per team
- [ ] Calcutta bids automatically create user charges
- [ ] Admin can view a master ledger with all balances
- [ ] Participants can see their personal balance and itemized breakdown
- [ ] Home page shows a balance summary card when financials are enabled
- [ ] All financial changes include audit trail (who, when)
