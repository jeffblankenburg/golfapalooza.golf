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
GOLF_COURSE_API_KEY=your-golfcourseapi-key  # Optional, for external course search
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
| GET | `/api/courses?lat={lat}&lng={lng}&radius={miles}` | Search courses by GPS coordinates |
| GET | `/api/courses/{courseId}` | Get course details with tees and holes |

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

#### Admin (`/api/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users (includes current_user) |
| POST | `/api/admin/users` | Create a new user |
| DELETE | `/api/admin/users?id={userId}` | Delete a user |
| GET | `/api/admin/nominations` | List all rookie nominations |
| PATCH | `/api/admin/nominations` | Approve or reject a nomination |

## Database Schema

### Tables

- `users` - User profiles (display_name, phone, full_name)
- `courses` - Cached golf courses from GolfCourseAPI
- `course_tees` - Tee boxes with ratings (course_rating, slope_rating)
- `course_holes` - Hole details (par, handicap_index, yards)
- `rounds` - Scoring sessions
- `round_players` - Players in a round (up to 4)
- `round_scores` - Hole-by-hole scores
- `player_handicaps` - Current handicap data
- `handicap_history` - Handicap changes over time
- `rookie_nominations` - Peer-nominated rookies pending admin approval

### Migrations

Located in `supabase/migrations/`:
- `00001_initial_schema.sql` - Users and auth setup
- `00002_golf_scoring_schema.sql` - Golf scoring tables and RLS policies
- `00003_fix_rls_recursion.sql` - Fix RLS recursion for SELECT policies
- `00004_fix_rls_all_operations.sql` - Fix RLS recursion for INSERT/UPDATE/DELETE

**IMPORTANT: Always create NEW migration files.** Never modify existing migrations that may have already been run. Use sequential numbering (00004, 00005, etc.) for new migrations. Each migration should be atomic and handle its own rollback safety (use `DROP ... IF EXISTS` before `CREATE`).

## Key Features

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
