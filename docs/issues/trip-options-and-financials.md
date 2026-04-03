## Overview

Golfapalooza needs two interconnected systems: a **Trip Options** system where Loozers select their preferences and add-ons for each trip, and a **Financial Ledger** that tracks every dollar owed and paid across a Loozer's entire lifetime in the system.

**Options** are per-trip. **Money is forever.**

When a Loozer selects a paid option (e.g., "KGB Cup — $65"), a charge immediately appears on their ledger. If they change their mind before the deadline, the charge updates automatically. After the deadline, only admins can make changes. Manual debits and credits (e.g., reimbursing a Loozer for buying groceries) are always available to admins regardless of deadlines.

A Loozer's balance carries over year to year. If someone ends 2025 with +$200 in their account, that $200 is still there when the 2026 trip begins.

---

## Phase 1: Schema + Admin Option Builder + Admin Dashboard + Financial Ledger

### Database Schema

#### `option_groups`

Organizes options into named sections (e.g., "Financial", "Preferences", "Attendance").

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| trip_id | uuid | FK to trip_settings |
| name | text | Group name (e.g., "Contest Entry Fees") |
| description | text | Optional helper text shown to Loozers |
| sort_order | int | Display order among groups |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `trip_options`

Individual options within a group. Each option has a type that determines its UI and behavior.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| group_id | uuid | FK to option_groups |
| trip_id | uuid | FK to trip_settings |
| name | text | Option label (e.g., "Trip Fee", "Shirt Size") |
| description | text | Optional helper text |
| option_type | text | One of: `checkbox`, `select`, `multi_select`, `text`, `number` |
| choices | jsonb | For select/multi_select: array of `{ label, value, cost }` objects |
| cost | numeric(10,2) | For checkbox type: fixed cost when selected (null = no cost) |
| is_required | boolean | Whether Loozers must answer this option |
| sort_order | int | Display order within group |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Option types explained:**

| Type | UI | Cost behavior | `choices` column | `cost` column |
|------|-----|---------------|------------------|---------------|
| `checkbox` | Toggle on/off | Flat cost when checked | null | e.g., 651.00 |
| `select` | Dropdown / radio group | Cost per choice (can vary) | `[{label: "KGB Cup", value: "kgb", cost: 65}, {label: "KGB + Boland", value: "kgb_boland", cost: 85}, {label: "Neither", value: "none", cost: 0}]` | null (cost is in choices) |
| `multi_select` | Checkboxes | Sum of selected choice costs | `[{label: "Monday Night", value: "mon", cost: 75}, {label: "Tuesday Night", value: "tue", cost: 75}, {label: "Breakfast", value: "breakfast", cost: 15}]` | null (cost is in choices) |
| `text` | Text input | No cost | null | null |
| `number` | Number input | No cost | null | null |

#### `user_option_selections`

Stores each Loozer's choices. One row per user per option.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| trip_id | uuid | FK to trip_settings |
| user_id | uuid | FK to users |
| option_id | uuid | FK to trip_options |
| value | jsonb | The selection value — see below |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Unique constraint:** `(user_id, option_id)` — one selection per user per option.

**Value storage by type:**
- `checkbox`: `true` or `false`
- `select`: `"kgb"` (the chosen value)
- `multi_select`: `["mon", "tue"]` (array of selected values)
- `text`: `"XL"` (string)
- `number`: `24` (number)

#### `trip_option_settings`

Per-trip configuration for the options system.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| trip_id | uuid | FK to trip_settings (unique) |
| selection_deadline | timestamptz | Deadline for Loozer self-service selections |
| is_open | boolean | Manual override to open/close selections |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Selections are allowed when `is_open = true` AND `now() < selection_deadline`. Admins can always edit regardless.

#### `financial_transactions`

The core ledger table. Every dollar in or out is a row here. User-scoped, not trip-scoped (but transactions reference a trip for reporting).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| trip_id | uuid | FK to trip_settings (nullable — for carry-over or non-trip transactions) |
| type | text | `charge` or `payment` |
| source | text | `option` (auto-generated from selection), `manual` (admin-entered), or `adjustment` (admin credit/debit) |
| option_id | uuid | FK to trip_options (nullable — only set for option-derived charges) |
| description | text | Human-readable line item (e.g., "Trip Fee", "Venmo payment received") |
| amount | numeric(10,2) | Always positive. Direction determined by `type`. |
| method | text | For payments: cash, venmo, check, zelle, other (nullable for charges) |
| notes | text | Optional admin notes |
| created_by | uuid | FK to users — who created this transaction |
| created_at | timestamptz | |

**Key design decisions:**
- `amount` is always positive. `type = 'charge'` means they owe more; `type = 'payment'` means they paid.
- Option-derived charges use `source = 'option'` and link to `option_id`. When a Loozer changes a selection, the system deletes old option charges for that option and creates new ones.
- Manual admin entries use `source = 'manual'` or `source = 'adjustment'`.
- Balance = sum of payments − sum of charges. Negative balance = they owe money. Positive = they have credit.
- No rows are ever soft-deleted. If an admin removes a charge, the row is hard-deleted (the ledger only contains real transactions). Audit trail is maintained via the `created_by` and `created_at` fields, and we can add a separate audit log table later if needed.

---

### API Endpoints

#### Options Management (Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/options?trip_id={id}` | Get all option groups, options, and settings for a trip |
| POST | `/api/admin/options/groups` | Create an option group |
| PUT | `/api/admin/options/groups/{id}` | Update an option group |
| DELETE | `/api/admin/options/groups/{id}` | Delete an option group (cascades to options) |
| POST | `/api/admin/options` | Create an option |
| PUT | `/api/admin/options/{id}` | Update an option |
| DELETE | `/api/admin/options/{id}` | Delete an option (cascades to selections + option charges) |
| PUT | `/api/admin/options/settings` | Update trip option settings (deadline, is_open) |

#### Selections (Admin in Phase 1, Loozers in Phase 2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/selections?trip_id={id}` | Get all Loozers' selections for a trip (the grid view) |
| PUT | `/api/admin/selections` | Set a Loozer's selection for an option (creates/updates selection + syncs charges) |
| GET | `/api/options?trip_id={id}` | (Phase 2) Get options for Loozer self-service |
| GET | `/api/selections` | (Phase 2) Get current user's selections |
| PUT | `/api/selections` | (Phase 2) Set current user's selection (with deadline enforcement) |

#### Financial Ledger (Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/financials/summary?trip_id={id}` | Dashboard summary: total needed, collected, outstanding, per-Loozer balances |
| GET | `/api/admin/financials/ledger?user_id={id}` | Full transaction history for a specific Loozer |
| POST | `/api/admin/financials/transactions` | Add a manual charge or payment |
| DELETE | `/api/admin/financials/transactions/{id}` | Remove a transaction (only manual ones; option-derived are managed via selections) |

#### Financial Ledger (Loozer-facing, Phase 3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/financials/me` | Current user's balance + itemized breakdown |

---

### UI Components

#### Admin: `OptionGroupManager.tsx`
- CRUD for option groups (name, description, sort order)
- Drag-to-reorder groups
- Inline editing

#### Admin: `OptionBuilder.tsx`
- CRUD for options within a group
- Type selector (checkbox, select, multi_select, text, number)
- Dynamic form: shows cost field for checkbox, choices editor for select/multi_select
- Preview of what the Loozer will see

#### Admin: `SelectionDashboard.tsx`
- Grid/table: rows = Loozers (from roster), columns = options (grouped)
- Each cell is an inline editor matching the option type (checkbox, dropdown, etc.)
- Right-most columns: total cost for this trip, lifetime balance
- Filters: show only unpaid, sort by balance, search by name
- Bulk actions: "Apply default to all Loozers who haven't selected"

#### Admin: `FinancialDashboard.tsx`
- **Summary cards at top:**
  - Total charges (this trip)
  - Total payments received (this trip)
  - Total outstanding (this trip)
  - Number of Loozers fully paid / partially paid / unpaid
- **Loozer balance table:**
  - Name, trip charges, trip payments, trip balance, lifetime balance
  - Click a row to expand inline ledger detail
  - Sort by any column
  - Visual indicators (green = paid/credit, red = outstanding)
- **Quick actions:**
  - Record a payment (select Loozer, amount, method, notes)
  - Add a manual charge/credit (select Loozer, amount, description)
- **Admin tools:**
  - "Who hasn't paid?" filtered view
  - Export summary (CSV or printable view)
  - Optional: send notification to a Loozer about their balance

#### Admin: `TransactionForm.tsx`
- Reusable form for recording payments and manual charges/credits
- Fields: Loozer (dropdown), type (charge/payment), amount, method (if payment), description, notes
- Optional: "notify this Loozer" checkbox (sends a notification)

---

### Admin Navigation

Add two new sections to the event admin page (`/admin/events/[tripId]`):
- **Trip Options** — links to the option builder + selection dashboard
- **Financials** — links to the financial dashboard

---

## Phase 2: Loozer-Facing Selection Form + Deadline Enforcement

#### `OptionSelectionForm.tsx`
- Renders all option groups and options for the active trip
- Each option renders as its appropriate input type
- Shows running cost total as selections are made
- Shows current balance impact ("Your current balance: -$200 → Selections will add $751 → New balance: -$951")
- Disabled state after deadline with message: "Selections are closed. Contact an admin to make changes."
- Auto-saves selections on change (debounced)

#### Deadline enforcement
- `PUT /api/selections` checks `is_open` and `selection_deadline` before allowing changes
- Admin `PUT /api/admin/selections` bypasses deadline checks
- UI shows countdown to deadline when within 7 days

---

## Phase 3: Loozer Balance View

#### Home page card: `BalanceSummaryCard.tsx`
- Shows on the home page when financials exist
- Displays: "You owe $751" or "You have a $200 credit"
- Tap to navigate to full breakdown

#### `MyFinancials.tsx` page
- Balance summary at top
- Itemized charges grouped by trip
- Payment history
- Current trip's option selections summary

---

## Edge Cases & Considerations

- **Deleting an option that has selections**: Cascade-delete selections AND any `source = 'option'` charges linked to that option. Recalculate affected Loozers' trip totals.
- **Changing an option's cost**: Existing selections should NOT retroactively update charges. The charge amount is locked at selection time. If the admin needs to update, they should delete and re-add the option, or manually adjust.
- **Loozer removed from roster**: Their selections and option-derived charges for that trip should be removed. Manual charges/payments remain on their ledger.
- **New Loozer added mid-trip**: They start with no selections. Admin can fill in their options via the selection dashboard.
- **Option with `is_required = true`**: Phase 2 UI should prevent form submission until all required options are answered. Phase 1 (admin) can leave them blank.
- **Zero-cost selections**: Still tracked (e.g., shirt size, beer preference) but generate no financial transactions.
- **Negative lifetime balance**: Normal — means they owe money. Positive means they have credit.

---

## Migration Plan

Create a single new migration file (`00071_trip_options_and_financials.sql`) containing:
1. `option_groups` table
2. `trip_options` table
3. `user_option_selections` table with unique constraint
4. `trip_option_settings` table
5. `financial_transactions` table
6. RLS policies: authenticated users can read their own selections and transactions; admins can read/write all
7. Indexes on `financial_transactions(user_id)`, `financial_transactions(trip_id)`, `user_option_selections(user_id, option_id)`

---

## Acceptance Criteria

### Phase 1
- [ ] Admin can create, edit, reorder, and delete option groups
- [ ] Admin can create options of all types (checkbox, select, multi_select, text, number) with costs
- [ ] Admin can configure selection deadline and open/close toggle per trip
- [ ] Admin can view and edit all Loozers' selections in a grid dashboard
- [ ] Selecting a paid option immediately creates a charge on the Loozer's ledger
- [ ] Changing a selection auto-updates the corresponding charge
- [ ] Admin can record manual payments with method and notes
- [ ] Admin can add manual charges/credits with descriptions
- [ ] Admin financial dashboard shows summary stats (total needed, collected, outstanding)
- [ ] Admin can view per-Loozer balances and drill into transaction history
- [ ] Lifetime balances carry across trips (no trip-scoping on the balance calculation)
- [ ] Deleting an option cascades to remove selections and option-derived charges

### Phase 2
- [ ] Loozers can view and fill out their option selections
- [ ] Running cost total updates as selections change
- [ ] Selections auto-save
- [ ] Deadline enforcement: Loozers cannot change selections after deadline
- [ ] Admins can still edit after deadline

### Phase 3
- [ ] Home page shows balance summary card
- [ ] Loozers can view full itemized financial breakdown
- [ ] Transaction history grouped by trip
