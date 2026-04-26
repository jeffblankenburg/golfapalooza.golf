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
| POST | `/api/courses/lookup` | Run the DB → GCAPI → AI cascade. Returns a draft scorecard for the user to confirm; 422 with prefill when cascade exhausted. |
| POST | `/api/courses/lookup/commit` | Persist a confirmed lookup draft as a real course + tees + holes. |

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

#### Cron (`/api/cron`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron/birthday-posts` | Bearer-authed cron. Posts a randomly chosen birthday message to the "All Loozers" chat room for each Loozer with a birthday today. Idempotent via `birthday_posts(user_id, year, room_id)`. |

#### Admin (`/api/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users (includes current_user) |
| POST | `/api/admin/users` | Create a new user |
| DELETE | `/api/admin/users?id={userId}` | Delete a user |
| GET | `/api/admin/nominations` | List all rookie nominations |
| PATCH | `/api/admin/nominations` | Approve or reject a nomination |
| GET | `/api/admin/fake-ads` | List all fake ads (includes inactive) |
| POST | `/api/admin/fake-ads` | Upload a new fake ad (multipart: `file`, `alt_text`, `tagged_user_ids`, `active`) |
| PATCH | `/api/admin/fake-ads/{id}` | Update alt_text, active, or tags |
| DELETE | `/api/admin/fake-ads/{id}` | Delete a fake ad and its storage object |
| GET | `/api/admin/courses/unverified` | List courses awaiting verification (created via the lookup cascade) |
| POST | `/api/admin/courses/{id}/verify` | Mark an AI/GCAPI-imported course as verified |
| DELETE | `/api/admin/courses/{id}/verify` | Revert a course to community-submitted |
| DELETE | `/api/admin/courses/{id}` | Delete a course (cascades to tees/holes; 409 if any rounds reference it) |

## Database Schema

### Tables

- `users` - User profiles (display_name, phone, full_name, `is_founder`, `sponsor_id` self-FK for the Loozer family tree)
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

### Migrations

Located in `supabase/migrations/`:
- `00001_initial_schema.sql` - Users and auth setup
- `00002_golf_scoring_schema.sql` - Golf scoring tables and RLS policies
- `00003_fix_rls_recursion.sql` - Fix RLS recursion for SELECT policies
- `00004_fix_rls_all_operations.sql` - Fix RLS recursion for INSERT/UPDATE/DELETE
- `00112_ai_course_import.sql` - `lookup_key`/`source`/`verified` on courses, `confidence` on tees, `ai_generations` audit table

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
- `/loozers` and `/spectator/loozers`: Grid | Tree toggle (persisted in localStorage). Tree is a vertical org chart with pinch-zoom + pan. Authenticated tree centers on the current user's node and highlights it.

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
