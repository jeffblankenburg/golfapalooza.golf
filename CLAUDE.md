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

#### Admin (`/api/admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List all users (includes current_user) |
| POST | `/api/admin/users` | Create a new user |
| DELETE | `/api/admin/users?id={userId}` | Delete a user |

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

1. Add JSDoc comments with OpenAPI annotations for Swagger
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
