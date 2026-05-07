# Golfapalooza.golf - Development Guide

## Project Overview

A PWA for live golf scoring, round tracking, and USGA handicap calculation. Built with Next.js 16, Supabase, and Tailwind CSS.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Supabase SMS OTP authentication
- **Styling**: Tailwind CSS
- **PWA**: next-pwa
- **API Docs**: Swagger UI (next-swagger-doc)

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GOLF_COURSE_API_KEY=your-golfcourseapi-key    # Step 1 of the /api/courses/lookup cascade
OPENROUTER_API_KEY=your-openrouter-key        # Step 2 of the cascade (AI scorecard lookup)
OPENROUTER_SITE_URL=https://golfapalooza.golf # Optional OpenRouter attribution
OPENROUTER_APP_NAME=Golfapalooza              # Optional OpenRouter attribution
NEXT_PUBLIC_GIPHY_API_KEY=your-giphy-api-key  # For GIF search in chat
NEXT_PUBLIC_MAPBOX_TOKEN=your-mapbox-token    # For satellite maps in scoring
```

## API Documentation

Interactive API documentation is available at `/api-docs` when the app is running.

### API Endpoints

#### Courses (`/api/courses`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/courses?q={query}` | Search courses by name or location |
| GET | `/api/courses?lat={lat}&lng={lng}&radius={miles}` | Search cached courses by GPS coordinates (haversine, capped at 20). |
| GET | `/api/courses/{courseId}` | Get course details with tees and holes |
| POST | `/api/courses/lookup` | Run the DB → GCAPI → AI cascade. Returns a draft scorecard for the user to confirm; 422 with prefill when cascade exhausted. Filters out drafts whose `lookup_key`/`external_id` already exist in our DB; if every candidate is already imported, returns `step: "all_imported"` with the existing rows so the user can still pick one. |
| POST | `/api/courses/lookup/commit` | Persist a confirmed lookup draft as a real course + tees + holes. |
| POST | `/api/courses/lookup/commit-bulk` | Persist multiple confirmed drafts in one call (multi-course clubs via "Import all"). Returns `{ courses, errors }`. |

#### Rounds (`/api/rounds`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rounds` | List user's rounds (query: status, limit) |
| POST | `/api/rounds` | Create a new round |
| GET | `/api/rounds/{roundId}` | Get round details with players and scores |
| PUT | `/api/rounds/{roundId}` | Update round (notes, weather, status) |
| DELETE | `/api/rounds/{roundId}` | Delete a round |
| PUT | `/api/rounds/{roundId}/scores` | Batch update hole scores |
| POST | `/api/rounds/{roundId}/complete` | Complete round and calculate differentials |

#### Handicap (`/api/handicap`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/handicap` | Get current user's handicap and recent rounds |
| POST | `/api/handicap` | Recalculate handicap from last 20 rounds |

#### Auth (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/send-otp` | Send SMS verification code |
| POST | `/api/auth/signout` | Sign out current user |

#### Nominations (`/api/nominations`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/nominations` | List current user's rookie nominations |
| POST | `/api/nominations` | Submit a new rookie nomination |

#### Fake Ads (`/api/fake-ads`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fake-ads?userId={userId}` | List active fake ads (optionally filtered to those tagging a Loozer) |

#### Birthdays (`/api/birthdays`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/birthdays/today` | List Loozers whose birthday falls on today (in the active trip's timezone). Returns `{id, display_name, avatar_url, age}[]`. |

#### Loozers (`/api/loozers`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loozers/locations` | Loozers with cached lat/lng (`show_on_map=true`, non-financial-only, non-system) for the `/loozers` Map tab. Returns `{id, display_name, avatar_url, city, state, latitude, longitude}[]`. |

#### Polls (`/api/polls`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/polls/active` | Returns the currently active poll for the current user (or `{poll: null}` if none/not eligible). Includes the user's existing response when present. |
| GET | `/api/polls/{id}` | Get a poll the current user is eligible for. Drafts are admin-only. Includes results when `status='closed'`. |
| POST | `/api/polls/{id}/respond` | Submit or update the user's full response. Body: `{answers: [{question_id, option_id?, text_answer?}]}`. Multi-select submits multiple answers per question_id. Validates audience, status, single/multi/text constraints. |
| DELETE | `/api/polls/{id}/respond` | Withdraw the current user's response (only while poll is active). |
| GET | `/api/polls/history` | List closed polls visible to the current user. |

#### Cron (`/api/cron`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron/birthday-posts` | Bearer-authed cron. Posts a randomly chosen birthday message to the "All Loozers" chat room for each Loozer with a birthday today. Idempotent via `birthday_posts(user_id, year, room_id)`. |
| GET | `/api/cron/polls-lifecycle` | Bearer-authed cron, runs every minute. Promotes scheduled→active polls (one at a time, DB-enforced) and closes active polls past their `ends_at`. Sends launch notifications to the resolved audience when `send_notification_on_launch` is true. |

#### Admin (`/api/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users (includes current_user) |
| POST | `/api/admin/users` | Create a new user |
| DELETE | `/api/admin/users?id={userId}` | Delete a user |
| GET | `/api/admin/users/{userId}/scorecards` | Per-user list of completed scorecards with the user's hole-by-hole scores. Powers the Scorecards tab on `/admin/users/{userId}`. |
| GET | `/api/admin/users/{userId}/songs` | Per-song aggregate of song plays by this user (`play_count` + `last_played`). Powers the Songs tab. |
| GET | `/api/admin/users/{userId}/stats` | Derived per-user stats: scoring breakdown (eagles/birdies/pars/bogeys/doubles+ counts and percentages, best gross, best differential), accolades by category, and engagement (page views/chat/uploads/score saves/song plays in the last 30 days + `last_active`). Powers the Stats tab. |
| GET | `/api/admin/nominations` | List all rookie nominations |
| PATCH | `/api/admin/nominations` | Approve or reject a nomination |
| DELETE | `/api/admin/nominations?id={nominationId}` | Delete a rejected nomination (only when `status='rejected'`) |
| GET | `/api/admin/fake-ads` | List all fake ads (includes inactive) |
| POST | `/api/admin/fake-ads` | Upload a new fake ad (multipart: `file`, `alt_text`, `tagged_user_ids`, `active`) |
| PATCH | `/api/admin/fake-ads/{id}` | Update alt_text, active, or tags |
| DELETE | `/api/admin/fake-ads/{id}` | Delete a fake ad and its storage object |
| GET | `/api/admin/courses/unverified` | List courses awaiting verification (created via the lookup cascade) |
| POST | `/api/admin/courses/{id}/verify` | Mark an AI/GCAPI-imported course as verified |
| DELETE | `/api/admin/courses/{id}/verify` | Revert a course to community-submitted |
| DELETE | `/api/admin/courses/{id}` | Delete a course (cascades to tees/holes; 409 if any rounds reference it) |
| GET | `/api/admin/polls` | List all polls (every status) with response counts |
| POST | `/api/admin/polls` | Create a poll as a draft. Body: `{title, description?, audience_type, audience_user_ids?, trip_id?, is_anonymous?, send_notification_on_launch?, questions: [{question_text, question_type, max_selections?, max_length?, options?}]}` |
| GET | `/api/admin/polls/{id}` | Get a poll with questions + admin results (counts only when anonymous) |
| PUT | `/api/admin/polls/{id}` | Update a poll. Smart-syncs questions/options (delete missing ones cascades to answers). Status transitions go through `/publish`, `/close`, `/reopen`. |
| DELETE | `/api/admin/polls/{id}` | Delete a poll (cascades to all responses) |
| POST | `/api/admin/polls/{id}/publish` | Promote a draft to scheduled or active. Body: `{starts_at, ends_at}`. 409 with `conflicts` array if window overlaps another scheduled/active poll. |
| POST | `/api/admin/polls/{id}/close` | Close an active or scheduled poll immediately |
| POST | `/api/admin/polls/{id}/reopen` | Reopen a closed poll. Body: `{ends_at}`. Existing responses preserved; no launch notification fires. |
| GET | `/api/admin/polls/conflicts?starts_at=&ends_at=&exclude_id=` | Returns `{conflicts, next_free_start}` for the requested window |
| GET | `/api/admin/history/state` | Snapshot used by the historical-import matcher: parsed workbook + every users row + per-trip accolade counts. Issue #114 Phase 1a. |
| PUT | `/api/admin/history/match` | Body: `{workbookName, userId\|null}`. Sets `users.workbook_name` (or clears it). Idempotent; first NULLs any user already holding that workbook_name to keep the unique index happy. |
| POST | `/api/admin/history/auto-match` | One-shot: applies every unambiguous workbook-name → user match (squashed-name comparison against `full_name` and `display_name`). Returns counts of applied vs. skipped (with reason). |
| GET | `/api/admin/history/import-accolades` | Dry-run preview of the accolade import. Returns rows that would insert + rows skipped because their winner isn't matched yet + doubles-partner fallbacks. |
| POST | `/api/admin/history/import-accolades` | Run the accolade import. Idempotent on `(trip_id, category, user_id, COALESCE(partner_user_id, '0…'::uuid))`. Skips awards whose winner workbook_name isn't matched; partner_user_id falls back to NULL when the partner isn't matched. Safe to re-run as more users get matched. |
| GET | `/api/admin/history/import-attendance` | Dry-run preview of the attendance import (Phase 1b of #114). Returns rows that would insert from the Attendance sheet + rows skipped because their workbook_name isn't matched. |
| POST | `/api/admin/history/import-attendance` | Run the attendance import. Idempotent on `(user_id, trip_id)`. Skips rows whose workbook_name isn't matched. Safe to re-run as more users get matched. |
| GET | `/api/admin/history/verify` | Cross-check imported accolades against the workbook's Summary sheet. Per-category and per-user diff. Cornhole doubles imports are doubled in the Summary comparison (Summary credits both teammates; Awards sheet stores one row per team). |
| GET | `/api/admin/accolades/categories` | List the editable accolade category metadata (title, short_label, icon, description, sort_order) used by profile pages and the public `/accolades` gallery. |
| PUT | `/api/admin/accolades/categories/{category}` | Update one category's display fields. Body: `{title?, short_label?, icon?, description?, sort_order?}`. |
| POST | `/api/admin/accolades/categories/{category}/badge` | Upload a badge image (multipart, `file`). Replaces the existing badge; sets `icon_url`. |
| DELETE | `/api/admin/accolades/categories/{category}/badge` | Remove the badge image and revert to the emoji icon. |
| GET | `/api/admin/analytics-overview?days={7\|14\|30}` | Admin-friendly analytics for the selected window: per-day breakdown (users/page-views/logins/chat/scores/uploads/notifications/errors), window totals for each metric, Loozers who have not installed the PWA, and Loozers inactive for that same window. Single `days` param drives every section of the page. Gated by `checkAnyPermissionAccess`. Powers `/admin/analytics`. |
| GET | `/api/admin/analytics-overview/day?date=YYYY-MM-DD` | Per-day breakdown for the analytics drill-down: full event counts + active Loozers (with their per-event-type counts) + top pages. Same auth gate. |

## Database Schema

### Tables

- `users` - User profiles (display_name, phone, full_name, `is_founder`, `sponsor_id` self-FK for the Loozer family tree, `workbook_name` join key from the historical Golfapalooza workbook for issue #114 — unique when set, `city`/`state`/`latitude`/`longitude`/`geocoded_at`/`show_on_map` for the `/loozers` Map tab — issue #120)
- `courses` - Cached golf courses; `source` ∈ ('manual','gcapi','ai'), `verified` flag, `lookup_key` for cross-user dedup
- `course_tees` - Tee boxes with ratings (course_rating, slope_rating); `confidence` jsonb for AI-extracted ratings
- `course_holes` - Hole details (par, handicap_index, yards)
- `rounds` - Scoring sessions
- `round_players` - Players in a round (up to 4)
- `round_scores` - Hole-by-hole scores
- `player_handicaps` - Current handicap data
- `handicap_history` - Handicap changes over time
- `rookie_nominations` - Peer-nominated rookies pending admin approval
- `fake_ads` - Admin-uploaded humor banner ads shown on the home page
- `fake_ad_loozers` - Many-to-many tags linking fake ads to Loozers
- `birthday_posts` - Idempotency log for the daily birthday chat auto-post (user_id, year, room_id)
- `ai_generations` - Audit log for every OpenRouter call (task, model, input_hash, output, confidence, cost_usd, latency_ms, committed). RLS-locked; server-only access via service role.
- `polls` - Admin-authored polls. Same audience model as announcements. `status` ∈ ('draft','scheduled','active','closed'). Partial unique index enforces only one active poll at a time; application enforces no scheduled-window overlap.
- `poll_questions` - Per-poll questions. `question_type` ∈ ('single','multi','text'). `max_selections` (multi) and `max_length` (text) are optional caps.
- `poll_options` - Choices for select-type questions
- `poll_responses` - One row per (poll, user) tracking who voted
- `poll_answers` - Per-question answers; multi-select uses N rows. `option_id` XOR `text_answer` is enforced via CHECK.
- `accolades` - Per-trip awards. `category` is a FK to `accolade_categories.category`; `partner_user_id` is set for doubles cornhole (one row per team). Partial unique index `(trip_id, category, user_id, COALESCE(partner_user_id, '0…'))` for `category != 'custom'` makes the historical importer (issue #114) idempotent.
- `accolade_categories` - Editable display metadata for award categories: `title`, `short_label`, `icon` (emoji), `description`, `sort_order`. Seeded with the canonical 8 (mvl/roy/melc/bspitw/green_jacket/cornhole_singles/cornhole_doubles/custom). Admins manage at `/admin/accolades`.

### Migrations

Located in `supabase/migrations/`:
- `00001_initial_schema.sql` - Users and auth setup
- `00002_golf_scoring_schema.sql` - Golf scoring tables and RLS policies
- `00003_fix_rls_recursion.sql` - Fix RLS recursion for SELECT policies
- `00004_fix_rls_all_operations.sql` - Fix RLS recursion for INSERT/UPDATE/DELETE
- `00112_ai_course_import.sql` - `lookup_key`/`source`/`verified` on courses, `confidence` on tees, `ai_generations` audit table
- `00114_polls.sql` - Polls feature: `polls`, `poll_questions`, `poll_options`, `poll_responses`, `poll_answers`. RLS-locked (server-only access via service role).
- `00119_history_accolades.sql` - Phase 1a of historical import (issue #114): `users.workbook_name` join key, `accolades.category` enum + check constraint, `accolades.partner_user_id` for doubles cornhole, partial unique index for importer idempotency.
- `00120_accolade_categories.sql` - `accolade_categories` table for admin-editable award metadata. Replaces the CHECK constraint on `accolades.category` with a FK so new categories can be added without migrations.
- `00121_accolade_badge_images.sql` - Optional badge images for awards. `accolade_categories.icon_url` + `accolade-badges` storage bucket (public read, admin-only write).
- `00124_user_geocode.sql` - `users.latitude`/`longitude`/`geocoded_at` (city-level coords cached from Mapbox) + `users.show_on_map` (default `true`) for the `/loozers` Map tab (issue #120). Geocode-on-write hooks live in `ProfileEditor.handleSave` and `/api/admin/users` PUT — both call `geocodeAddress({city, state})` from `src/lib/geocode.ts` whenever city/state changes. Backfill via `node scripts/backfill-loozer-geocode.mjs`.
- `00126_analytics_overview.sql` - `analytics_overview_v1(inactive_days int)` SQL function powering `/admin/analytics` (daily totals, no-PWA users, inactive users). Excludes `is_system` and `is_financial_only` from user lists. PWA detection uses `metadata->>'pwa' = 'true'` from `activity_log`.
- `00127_analytics_overview_metrics.sql` - Expands `analytics_overview_v1` with per-day breakdowns for logins/chat/scores/uploads/notifications/errors and 30-day cumulative totals; adds `analytics_day_detail(target_day date)` for the tap-into-day drawer (per-user event counts and top pages).
- `00128_analytics_overview_window.sql` - Replaces `analytics_overview_v1` signature with a single `window_days` param (DROP + recreate). All totals, the daily array, and the inactive-user cutoff are now scoped to that window so the page can drive everything from a single 7/14/30 toggle.
- `00129_analytics_day_detail_uploads.sql` - Updates both analytics functions to surface `song_plays` (sourced from the `song_plays` table, not `activity_log`) in window totals, daily breakdown, and per-user day detail. Adds `gallery_uploads` to per-user day detail.
- `00130_analytics_users_breakdown.sql` - Adds `users_breakdown[]` to `analytics_overview_v1` — per-Loozer page-views/messages/photo-uploads/song-plays for the selected window. Powers the sortable Active Loozers table on `/admin/analytics`.
- `00131_event_participants_likelihood_set_at.sql` - Adds `likelihood_set_at` timestamp to `event_participants` for the "Date Signed" column on the home participants box. Backfilled from `created_at` for existing rows.
- `00132_event_attendance.sql` - `event_attendance(user_id, trip_id)` table for Phase 1b of issue #114. Sourced from the Attendance sheet of `Golfapalooza History.xlsx` via `/api/admin/history/import-attendance`. Surfaced as the per-user "events attended" count on `/loozers` grid, the family tree, and the profile page.

**IMPORTANT: Always create NEW migration files.** Never modify existing migrations that may have already been run. Use sequential numbering (00004, 00005, etc.) for new migrations. Each migration should be atomic and handle its own rollback safety (use `DROP ... IF EXISTS` before `CREATE`).

## Key Features

### AI-Assisted Course Import (Lookup Cascade)

When a user (or admin) needs to add a course they've never played before, `/api/courses/lookup` runs a 3-step fallback chain so the common case is instant and the long tail still gets resolved automatically:

1. **DB cache** — match by `lookup_key` (normalized name|state|city). Two users searching for the same course converge on the same row, so this is the path 90% of summer rounds will take after the first user adds a course.
2. **GolfCourseAPI** — sub-second, free under the 300/day quota. Catches well-known clubs and most regional courses with full slope/rating/per-hole data.
3. **AI scorecard lookup** — Claude Haiku 4.5 with web search via OpenRouter (model picked after the Phase 0 comparison in `scripts/test-models.mjs`: 7/7 hit rate vs sonar-pro's 6/7). Prompted to prefer structured scorecard databases (BlueGolf, 18Birdies, Golfify, GolfPass) before falling to general web search. Per-user rate limit: 5 successful AI lookups per day.
4. **Manual entry fallback** — when the cascade exhausts, the lookup endpoint returns 422 with a `prefill` payload so the user is dropped into the manual `CourseForm` with their original input pre-populated.

Every AI call is logged to `ai_generations` with input/output/confidence/cost/latency, regardless of outcome. AI- and GCAPI-imported courses are flagged `verified=false` until an admin spot-checks them at `/admin/courses/unverified`. Manual courses are grandfathered in as verified.

The user-facing flow lives in `src/components/my-rounds/CourseLookupModal.tsx` and is triggered from the round-creation wizard's "Add a new course" CTA. The user sees a single confirmation screen showing the matched scorecard (name, location, source URL, all tees with par/rating/slope/yards) before anything is persisted.

To re-run the model comparison or coverage tests:
```bash
node scripts/test-cascade.mjs        # DB → GCAPI → AI cascade against Loozer courses
node scripts/test-models.mjs         # 4-model accuracy/cost matrix
node scripts/test-gcapi-coverage.mjs # GCAPI hit rate alone
```

### Handicap Calculation (USGA World Handicap System)

```
Score Differential = (113 / Slope) × (Adjusted Gross Score - Course Rating)
Handicap Index = Average of best 8 of last 20 differentials
```

- Net Double Bogey adjustment per hole: Max = Par + 2 + strokes received
- Minimum 3 rounds required for initial handicap

### Round Types

- `18` - Full 18 holes
- `9-front` - Front nine (holes 1-9)
- `9-back` - Back nine (holes 10-18)

### Historical Import (issue #114)

28+ years of Golfapalooza history land in the live tables (no parallel `historical_*` namespace). Workbook lives at `Golfapalooza History.xlsx` in the repo root and the parser at `src/lib/history/parse-workbook.ts` is pure-data (no DB).

Phase 1a (accolades only) is in:
- Schema: migration `00119_history_accolades.sql`
- Trip seeding: `node scripts/seed-historical-trips.mjs` (idempotent — already run for 1997–2024 with course = Alpine Lake, status = `archived`)
- Admin UI under `/admin/history`:
  - `/admin/history/users` — workbook-name → user matcher (auto-match unambiguous + manual picker for the rest)
  - `/admin/history/import` — accolade importer; gracefully skips awards whose winner isn't matched yet, doubles partner falls back to NULL when partner isn't matched
  - `/admin/history/verify` — cross-checks per-category and per-user counts against the workbook's Summary sheet
- User-facing payoff: profile page accolades section now shows category-aware icons and links the doubles cornhole partner

Phases 1b (individual rounds + attendance) and 1c (scramble rounds) are not yet built. See issue #114 for the full multi-phase plan.

### Loozer Sponsorship Tree

Every Loozer (except founding fathers) was brought in by another Loozer. The relationship is captured by:
- `users.is_founder` (boolean) — flagged for founders, who sit at the roots of the family tree
- `users.sponsor_id` (uuid, self-FK with `ON DELETE RESTRICT`) — the Loozer who brought them in

Rules enforced by `/api/admin/users`:
- A non-`is_financial_only` Loozer must be either a founder or have a sponsor (UI-gated; no DB CHECK)
- A Loozer cannot sponsor themselves or any of their descendants (cycle prevention, server-validated)
- Financial-only users are excluded from sponsor pickers and the tree view
- Trying to delete a Loozer with sponsees fails with a helpful error — admin must reassign first

Surface area:
- Admin: founder toggle + searchable sponsor picker in the user edit modal
- Profile pages: "Sponsor: [avatar] X" line, or "★ Founding Father" badge
- `/loozers` (authenticated only): Grid | Tree toggle (persisted in localStorage). Tree is a vertical org chart with pinch-zoom + pan, centered on the current user's node and highlighted. The spectator site does not expose Loozer profiles or the family tree.

### Polls

Admin-authored polls reuse the announcements audience model (`everyone` / `event` / `custom`). One poll can be **active** at a time — enforced by a partial unique index on `polls.status='active'`. Scheduled-window overlap is rejected at the API layer with a 409 + `conflicts` array + `next_free_start`.

Question types (v1):
- `single` — radio buttons; exactly one answer
- `multi` — checkboxes; optional `max_selections` cap
- `text` — free-text; optional `max_length` (default 500)

Lifecycle:
- **Draft** → **Scheduled** or **Active** via `POST /api/admin/polls/{id}/publish` (status depends on whether `starts_at` is in the future)
- Cron at `/api/cron/polls-lifecycle` runs every minute: promotes scheduled→active and active→closed when their windows hit. Only one scheduled poll is activated per tick (the earliest pending).
- **Reopen** via `POST /api/admin/polls/{id}/reopen` with a new `ends_at`. Existing responses preserved; no re-launch notification.

Anonymity:
- Per-poll `is_anonymous` flag. Results never expose `user_id` to anyone (including admins) when set. Free-text answers in admin view show name only when `is_anonymous=false`.
- The DB always records `user_id` to enforce one-vote-per-user and allow vote changes; the API just omits it from results responses.

Eligibility:
- Audience is evaluated **live** (not snapshotted at launch) — see `src/lib/audience.ts`. Anyone added to the audience after launch sees the poll; anyone removed loses access (their submitted votes remain in results).

Surface area:
- `/admin/polls` (admin): list, create, edit, publish, schedule, close, reopen, view results
- Home page: `<PollHomeButton />` shows a CTA only when there's an active poll for the current user; opens a `BottomDrawer` with `<PollForm />`
- `/polls` (player): history of closed polls visible to the current user
- Spectator page: **no polls** (consistent with personalization rule)

Launch notifications:
- Triggered by `send_notification_on_launch` (default true). Sent via `sendBulkNotifications` with `type: "poll"` and `data: { poll_id }`. Reopen does NOT re-notify.

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
```

## Project Structure

```
src/
├── app/
│   ├── (app)/           # Authenticated pages
│   │   ├── scoring/     # Live scoring
│   │   ├── rounds/      # Round history
│   │   ├── handicap/    # Handicap dashboard
│   │   └── admin/       # Admin pages
│   ├── (auth)/          # Auth pages (login, verify)
│   └── api/             # API routes
├── components/
│   └── scoring/         # Scoring UI components
├── lib/
│   ├── supabase/        # Supabase clients
│   ├── golf-course-api/ # External API client
│   ├── handicap/        # Handicap calculations
│   └── swagger.ts       # API documentation config
└── types/
    └── golf.ts          # TypeScript interfaces
```

## Adding New API Endpoints

When adding new API routes, always:

1. **Use `getEffectiveUserId(user.id)` instead of `user.id`** for all user-specific queries. This supports the admin simulator feature. Import from `@/lib/simulator`. Server component pages must do the same.
2. Add JSDoc comments with OpenAPI annotations for Swagger
2. Update this CLAUDE.md file with the new endpoint
3. Add appropriate TypeScript types to `src/types/golf.ts`
4. Include proper error handling and auth checks

Example JSDoc for API routes:

```typescript
/**
 * @swagger
 * /api/example:
 *   get:
 *     summary: Example endpoint
 *     tags: [Example]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: The item ID
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Example'
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  // Implementation
}
```

### Adding New Schemas

New schemas should be added to `src/lib/swagger.ts` in the `components.schemas` section:

```typescript
schemas: {
  NewSchema: {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
    },
  },
}
```

### Available Tags

Use these tags to group related endpoints:
- `Courses` - Golf course search and details
- `Rounds` - Round management and scoring
- `Handicap` - Handicap calculation and history
- `Auth` - Authentication endpoints
- `Admin` - Admin user management

## Cross-Table State Consistency

**IMPORTANT: Always think through cascading side effects when modifying data that is referenced across multiple tables or components.**

Many entities in this app have logical dependencies that the database doesn't enforce with foreign keys. When adding, removing, or modifying a record, proactively ask: "What other data becomes invalid or inconsistent because of this change?"

Examples of cross-table dependencies to watch for:
- **Contest participants → scramble team members**: Removing a contest participant must also remove them from any scramble team in that contest
- **Scramble teams → hole scores + bonus points**: Deleting a team cascades via DB foreign keys, but verify this for any new child tables
- **Bracket matches → downstream matches**: Un-advancing a bracket match must cascade to clear all downstream winner/loser placements
- **Sibling component state**: When one admin component mutates shared data (e.g., ScrambleManager changes teams), other open components (e.g., ScoringManager) must be notified to refresh — use `window.dispatchEvent(new CustomEvent(...))` for cross-component coordination

When implementing any delete, remove, or reassign operation:
1. Trace all tables/state that reference the affected entity
2. Handle cleanup in the same operation (not as an afterthought)
3. Use optimistic UI updates that can be reverted if the API fails
4. Notify sibling components if they might be displaying stale data

## API & Database Performance

**IMPORTANT: Always minimize the number of database round-trips and HTTP requests.**

When writing API routes that create or modify multiple related records:

1. **Batch inserts/upserts** — Use Supabase's array insert (`.insert([...rows])`) instead of looping with individual inserts. One call for N rows, not N calls for 1 row each.
2. **Batch updates** — When updating multiple rows with the same value, use a single `.update()` with `.in("id", [...ids])` instead of looping.
3. **Combine related operations into one API call** — If the client needs to create a parent record and its children (e.g., a round + players + scores), do it all in one POST handler, not 3 sequential API calls from the client.
4. **Parallel fetches** — When fetching independent data on the server or client, use `Promise.all()` instead of sequential awaits.
5. **Select only what you need** — Use `.select("id, name")` not `.select("*")` when you only need a few columns.

**Before writing any API route, ask: "How many database calls will this make for a typical request?" If the answer is more than 5, look for batch opportunities.**

## Spectator / Public Home Page

**When adding features to the authenticated home page (`HomeContent.tsx`), always check if they should also appear on the spectator home page (`SpectatorHomeContent.tsx`).** The spectator page is a public, no-auth version of the home page at `/spectator` that shows event info, the latest article, and limited quick links (KGB Cup, Course, Articles). It intentionally excludes anything personalized (RSVP, tee times, scoring, financials, action items, chat, notifications).

Spectator sub-pages live under `src/app/(public)/spectator/` and use `createAdminClient()` to bypass RLS since there is no authenticated user. Only expose truly public data — never phone numbers, financials, chat, or private user data.

## Verification Checklist

**After completing any implementation task, always provide a verification checklist.** This should be a concise list of manual tests and checks the user can perform to confirm the feature works correctly. Include:

1. **Happy path** — the primary use case works end-to-end
2. **Edge cases** — empty states, boundary conditions, missing data
3. **Undo/clear** — if the feature has a reset or clear action, verify it works
4. **Cross-user impact** — if the change affects what other users see, verify from another session/browser
5. **Existing functionality** — related features that could regress still work
6. **Database** — if a migration was added, confirm it has been run and the schema looks correct

Format as a numbered checklist the user can work through sequentially.

## Feature Planning & Issue Tracking

**GitHub Issues are the source of truth for feature planning and persistence.**

When planning new features or significant changes:

1. **Create a GitHub Issue** using `gh issue create` with a detailed description including:
   - Overview and problem statement
   - User experience flow
   - Technical implementation plan
   - Edge cases and error handling
   - Acceptance criteria

2. **Reference issues** when implementing features

3. **Close issues** when features are complete

Draft issue content can be written to `docs/issues/` as markdown files, then use:
```bash
gh issue create --title "Feature: Title" --body-file docs/issues/feature-name.md
```

## Feature Documentation

**IMPORTANT: Keep README.md up to date with all app capabilities.**

When adding new features, updating existing ones, or removing functionality:
1. Update the relevant section in `README.md` to reflect the change
2. Include both user-facing and admin capabilities
3. Note any time-gated or visibility-controlled features
4. The README serves as the definitive reference for what the app can do today
