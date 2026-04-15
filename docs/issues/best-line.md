## Overview

During the trip, funny moments and memorable quotes happen constantly, but by Saturday night's awards ceremony, most are forgotten. The **Best Line** feature lets Loozers capture these moments in real time by submitting short stories or quotes as they happen, building a nomination queue that the Best Line admin can review when it's time to pick winners.

## User Experience

### Submitting a Best Line (All Loozers)

1. Tap the **"Best Line"** quick link on the home page
2. See a simple form: a text area for the story/quote and a **Submit** button
3. Below the form, see a list of your own past submissions (newest first) with timestamps
4. Submissions are tied to the active trip — only current-trip entries are shown
5. Users can delete their own submissions if they made a mistake

### Reviewing Best Lines (Admin)

1. Loozers with the `manage_best_line` permission see an additional **"All Submissions"** tab/section
2. This view shows every submission from every Loozer, including:
   - The story/quote text
   - Who submitted it
   - When it was submitted
3. Admin can delete inappropriate submissions
4. This list serves as the master reference when picking Best Line award winners at the ceremony

## Technical Implementation

### Database

New table: `best_line_submissions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `trip_id` | uuid | FK to `trip_settings.id` |
| `submitter_id` | uuid | FK to `users.id` — who submitted |
| `text` | text | The story or quote (required, non-empty) |
| `created_at` | timestamptz | When submitted |

RLS policies:
- **SELECT**: Users can read their own submissions; users with `manage_best_line` permission (or `is_admin`) can read all
- **INSERT**: Any authenticated user can insert (with their own `submitter_id`)
- **DELETE**: Users can delete their own; admins/`manage_best_line` can delete any

No `status` or approval workflow — this is a simple collection, not a moderated queue.

### Migration

New migration file: sequential number following existing migrations.

### Permission

Add `manage_best_line` to `EVENT_PERMISSIONS` in `src/lib/permissions.ts`:
```typescript
{ key: "manage_best_line", label: "Best Line", description: "View all submissions & manage awards" }
```

### API Endpoints

#### `GET /api/best-lines`
- Auth required
- Returns current user's submissions for the active trip (sorted newest first)
- If user has `manage_best_line` permission: returns ALL submissions with submitter display names

#### `POST /api/best-lines`
- Auth required
- Body: `{ text: string }`
- Creates a submission for the active trip
- Validates text is non-empty

#### `DELETE /api/best-lines?id={submissionId}`
- Auth required
- Users can delete their own; `manage_best_line` permission can delete any
- Returns 403 if unauthorized

### Frontend

#### Quick Link (Home Page)
- Add to `allQuickLinks` in `HomeContent.tsx`
- Color: `bg-amber-50 text-amber-700` (warm/fun tone)
- Icon: speech bubble or quote marks (SVG in `/public/`)
- No `requiresContest` — always visible during an active trip

#### Page: `/best-line/page.tsx`
- **Top section**: Submit form (text area + submit button)
- **Bottom section**: 
  - Default tab: "My Submissions" — user's own entries
  - If `manage_best_line` permission: additional "All Submissions" tab showing everything with submitter names
- Each entry shows text, relative timestamp, and a delete button (trash icon)
- Optimistic UI for submit and delete

### Edge Cases

- Empty or whitespace-only text: reject with inline validation
- No active trip: show empty state ("No active trip")
- Long text: allow it — no character limit, but use `line-clamp` for display with expand-on-tap
- Multiple submissions: allowed — a Loozer can submit as many as they want
- Deleted submissions: hard delete (no soft delete needed, these aren't referenced elsewhere)

## Acceptance Criteria

- [ ] Loozer can submit a Best Line from the home page quick link
- [ ] Loozer sees their own submissions listed with timestamps
- [ ] Loozer can delete their own submissions
- [ ] Admin with `manage_best_line` permission sees all submissions with submitter names
- [ ] Admin can delete any submission
- [ ] Submissions are scoped to the active trip
- [ ] Quick link appears on home page during active trip
- [ ] Permission appears in admin permissions UI under Event Permissions
