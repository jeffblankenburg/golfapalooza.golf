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

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run lint         # Run ESLint
```

## API Routes & Documentation

API routes live under `src/app/api/`. Interactive docs are at `/api-docs` (Swagger UI, generated from `@swagger` JSDoc on each route).

To discover endpoints, list the directory or grep — don't rely on a static table here, it goes stale. Tags currently in use: `Courses`, `Rounds`, `Handicap`, `Auth`, `Admin`.

## Database & Migrations

Migrations live in `supabase/migrations/`, numbered sequentially. Each file's header comment describes what it does — read the file you care about rather than maintaining a separate inventory here.

**IMPORTANT: Always create a NEW migration file.** Never modify a migration that may have already been run. Use the next sequential number. Each migration should be atomic and use `DROP ... IF EXISTS` before `CREATE` for rollback safety.

**Grant Data API access on every new table.** Starting Oct 30, 2026, Supabase no longer auto-exposes tables in `public` to PostgREST/`supabase-js`. Any `CREATE TABLE` migration must end with an explicit grant or the table will be silently unreachable from the app (RLS doesn't help — grants sit above RLS). Standard pattern:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE new_table TO authenticated, service_role;
-- Add `anon` only when unauthenticated reads are intentional (e.g. spectator data).
-- For RLS-locked / server-only tables (audit logs, etc.), grant to service_role only.
```

### Non-obvious schema invariants

These rules aren't visible in a plain `\d` dump — keep them in mind when touching the schema:

- **`users.workbook_name`** — join key from the historical Golfapalooza workbook (issue #114). Unique when set; clearing/reassigning requires NULLing the prior holder first.
- **`users.sponsor_id`** — self-FK with `ON DELETE RESTRICT`. Cycle prevention is enforced server-side, not by the DB. Founders (`is_founder=true`) sit at the roots; everyone else must have a sponsor (UI-gated, not a DB CHECK).
- **`courses.lookup_key`** — normalized `name|state|city` for cross-user dedup. `source ∈ ('manual','gcapi','ai')`; AI/GCAPI imports are `verified=false` until an admin clears them.
- **`polls`** — partial unique index enforces only one `status='active'` poll at a time. Scheduled-window overlap is rejected at the API layer (409 with `conflicts` + `next_free_start`). Audience is evaluated live, not snapshotted at launch.
- **`poll_answers`** — `option_id` XOR `text_answer` enforced via CHECK.
- **`accolades`** — partial unique index `(trip_id, category, user_id, COALESCE(partner_user_id, '0…'))` for `category != 'custom'` makes the historical importer idempotent. `partner_user_id` is set for doubles cornhole (one row per team).
- **`accolade_categories.category`** is a FK target — adding categories no longer needs a migration.
- **`contest_winners`** is the single source of truth for who won what + paid status. The legacy per-contest tables (`daily_contest_winners`, `pickem_payouts`, `payout_paid_status`) were dropped in `00144`.
- **`contests`** is the spine: `buy_in_cost_item_id` (entry cost), `parent_contest_id` (e.g. Skins lives inside a Scramble day), `payout_splits` (pot carve-up), `declared_no_winner` (distinguishes "explicitly nobody won" from "not yet decided" on CTP/LD; drives the per-day pot carry chain in `src/lib/winners/daily-pots.ts`).
- **`contests.auto_enroll_attendees`** (migration 00165, issue #137) — when true, every on-roster Loozer (`event_participants.on_roster=true`) is mirrored into `contest_participants` with no explicit opt-in. Set true for `calcutta`/`scramble`/`ryder_cup` on `status IN ('active','test')` trips (NOT `scramble_skins`, which is a paid opt-in). Sync lives in `src/lib/attendance-contest-sync.ts::syncAttendanceEnrollment`, called from `POST /api/rsvp` (join) and `PUT /api/admin/attendance/cell` (both directions). Enroll is additive; removal is guarded — refuses (returns warnings) when a Calcutta bid/ownership, scramble team seat, or ryder pairing exists. Never touches `pickem_payments`. Full RSVP-"no" still hard-leaves via `cascadeRemoveFromRoster` (unguarded, by design). Per-option contests (cornhole/skins/pickem) enroll via `option-contest-sync.ts`, not this.
- **`contest_enrollment_exclusions`** (migration 00165) — tombstone of "this Loozer explicitly opted out of this contest; don't auto-re-add." Separate from `contest_participants` (which is deleted on removal and also carries Calcutta bid state). `syncAttendanceEnrollment` checks it before the additive enroll; `excludeFromContest`/`clearContestExclusion` set/clear it. Distinct from a full roster leave.
- **`cost_items`** is the universal $ catalog. Consumers FK back to it (`contests.buy_in_cost_item_id`, `cost_items.linked_option_id`, `cost_item_option_choices`). `payout_sheet_events.amount_per_participant` is intentionally kept as a fallback for Lodge Mon/Tue rows that aggregate multiple cost_items per stayer.
- **`payout_sheet_events.payee_count` / `.denomination_override`** (migration 00174) — the Payout Denominations page (`/admin/financials/denominations`) is now manual-first. Each row's **Total is the exact pot** (participant_count × amount × days); bills must sum to it — the old round-up-to-smallest-denom inflation is gone. `denomination_override` (JSONB `{denom: count}`) is the admin's hand-picked bill mix and, when set, is the source of truth (validated in the editor to equal the whole-dollar pot; `null` = use the auto suggestion). `payee_count` seeds the suggestion (`suggestExactDenoms` prefers bills ≤ one payee's share, then fills to the exact total) — it replaced the label-guessing + hardcoded ÷4 team-size. The exact-sum path lives in `effectiveSplitForRow`/`suggestExactDenoms` in `src/lib/payout-events/denominations.ts`; the older `splitForRow` family (per-kind heuristics + round-up) is now dead code, kept only for reference.
- **`trip_options.option_type='trip_cost'`** is the auto-derived Trip Cost option — its value = `SUM(cost_items.cost) WHERE included_in_trip_cost=true`.
- **`trip_settings.status='test'`** is the admin sandbox (issue #126). User-facing queries filter `status='active'`; admins reach the test event via the `sim-trip-id` cookie + `getEffectiveTripId()` helper.
- **`rounds.format`** (migration 00162) — `'individual'` (default) or `'scramble'`. Orthogonal to `round_type` (which still encodes hole count 18/9-front/9-back and drives par/scorecard display). Scramble = the whole group plays one team ball: the single per-hole team score is stored by fanning it out to **every** `round_players` row (each member's card equals the team card), so the round reuses the entire individual pipeline (`/scores` endpoint, realtime, completion) unchanged. Handicap exclusion is enforced in five spots keyed off format: the best-8-of-20 gathering query (`handicap.ts` filters `format='individual'`), the completion endpoint + `recalc.ts` (null adjusted/differential, no recalc), and `qualifiesForHandicap` in `POST /api/rounds`. Scramble rounds are also excluded from the personal avg/best stats (`my-rounds/page.tsx`) and the global Recent Rounds feed (`/api/rounds/recent`). They DO, however, appear in the home-page **Live Now** feed while in progress (`/api/rounds/live` selects `format IN ('individual','scramble')`, badged "Scramble") — a live-watchability surface, distinct from the completed-rounds/stats exclusions. Live scoring is the dedicated `ScrambleScoringEntry` (single team row); the resume page and `RoundForm` branch on format. There is NO personal-round team table — deliberately distinct from the trip-contest scramble system (`scramble_teams`/`scramble_hole_scores`, FK'd to `contests`).
- **`round_players`** — a roster row is EITHER a Loozer (`user_id` set, `guest_name` NULL) OR a guest (`user_id` NULL, `guest_name` set), per the `round_players_user_xor_guest` CHECK (migration 00161). Guests are non-app players we still score; they're unattached to any account (no claim path), have no handicap, and are skipped by all differential/adjusted/handicap math (API guards on `user_id IS NULL`). Per-hole scores key off `round_players.id`, never `user_id`, so guests "just work" for storage. Client code keys local score state by a **canonical player key**: `user_id` for Loozers, `guest:<round_player_id>` for guests (see `LiveScoringEntry`, the live + resume pages). `UNIQUE(round_id, user_id)` is now a partial index `WHERE user_id IS NOT NULL`, so multiple guests per round are allowed.
- **`event_participants.on_roster=true`** is the single source for "who attended" — modern signups and the historical workbook importer both write here. `event_attendance` is a legacy backup table; don't read from it.
- **`ai_generations`** — RLS-locked audit log of every OpenRouter call. Server-only via service role.

## Adding New API Endpoints

When adding new API routes, always:

1. **Use `getEffectiveUserId(user.id)` instead of `user.id`** for all user-specific queries (supports the admin simulator). Import from `@/lib/simulator`. Server component pages must do the same.
2. Annotate with `@swagger` JSDoc — copy the pattern from a neighboring route. New shared schemas go in `src/lib/swagger.ts` under `components.schemas`.
3. Add types to `src/types/golf.ts` as needed.
4. Proper auth checks and error handling.

## Key Features

### Handicap Calculation (USGA World Handicap System)

```
Score Differential = (113 / Slope) × (Adjusted Gross Score - Course Rating)
Handicap Index = Average of best 8 of last 20 differentials
```

- Net Double Bogey adjustment per hole: Max = Par + 2 + strokes received
- Minimum 3 rounds required for initial handicap
- Round types: `18`, `9-front` (holes 1–9), `9-back` (holes 10–18)

### AI-Assisted Course Import

`/api/courses/lookup` runs a 3-step cascade: **DB cache** (by `lookup_key`) → **GolfCourseAPI** (300/day free quota) → **AI scorecard lookup** (Claude Haiku via OpenRouter, prompted to prefer BlueGolf/18Birdies/Golfify/GolfPass; per-user limit 5/day). On exhaustion, returns 422 with a `prefill` payload so the user falls into manual `CourseForm`.

Every AI call is logged to `ai_generations` regardless of outcome. AI/GCAPI courses are `verified=false` until an admin clears them at `/admin/courses/unverified`. User-facing flow: `src/components/my-rounds/CourseLookupModal.tsx`. Coverage scripts: `scripts/test-cascade.mjs`, `scripts/test-models.mjs`, `scripts/test-gcapi-coverage.mjs`.

### Historical Import (issue #114)

28+ years of Golfapalooza history land in the live tables (no parallel `historical_*` namespace). Workbook at `Golfapalooza History.xlsx`; parser at `src/lib/history/parse-workbook.ts` is pure-data. Phase 1a (accolades) is shipped — admin UI at `/admin/history/{users,import,verify}`. Trip seeding: `node scripts/seed-historical-trips.mjs` (idempotent). Phases 1b/1c (rounds + attendance, scramble rounds) not yet built.

### Polls

Admin-authored, reuse the announcements audience model (`everyone` / `event` / `custom`). Question types: `single` (radio), `multi` (checkboxes, optional `max_selections`), `text` (optional `max_length`, default 500). Lifecycle: draft → scheduled/active via `/publish`; cron `/api/cron/polls-lifecycle` runs every minute to promote and close. `is_anonymous` strips `user_id` from results (DB still stores it for one-vote-per-user). Launch notifications fire via `sendBulkNotifications` with `type: "poll"`. Spectator page never shows polls.

### Loozer-Editable Courses (issue #133)

Every signed-in Loozer can edit any course that isn't `locked`. Admins can edit anywhere and toggle the lock. Course detail at `/courses/{id}` mounts `CourseManager` in `mode="loozer"` with `viewerIsAdmin` passed through; same component serves `/admin/courses`.

Load-bearing pieces:
- `src/lib/courses/edit-access.ts` — `checkCourseEditAccess(courseId)` gates every public write endpoint; `stampCourseEdit(courseId, userId)` runs after a successful write to set `courses.updated_at` + `updated_by`.
- `src/lib/courses/mapped-status.ts` — pure helper for the (tee, hole) fully-mapped check + `computeIdealDriveDefault` math used by the 250-yard ghost marker.
- **Legacy admin endpoints** (`/api/admin/course/holes`, `.../holes/coordinates`, `.../holes/upload`, `.../tees`) are thin re-exports of the public endpoints. One implementation, two paths.
- **Scorecard immutability**: editing a course never mutates stored round stats (gross/adjusted/differential/handicap are snapshotted at completion). Per-hole *visual* labels (Birdie/Par/Bogey) on the round detail page are derived live against current `course_holes.par` though, so they drift if par is corrected post-hoc. Documented in the help drawer.
- `/course` (singular) redirects to `/courses`.

### Co-Equal Round Ownership (issue #130)

A round has no single "owner" once created. Every player on the roster + every app admin can edit scores, complete the round, add/remove players, or delete it. `rounds.created_by` is preserved for the "Started by…" line on the detail page but no API gates on it. The shared gate lives in `src/lib/rounds/access.ts::canManageRound(roundId, userId)` — uses `getEffectiveUserId` (simulator-aware) and writes via the admin client so RLS doesn't silently no-op against non-creator scorers. Destructive actions confirm via `ConfirmModal`.

### Live Scoring Realtime Sync (issue #132)

`src/lib/realtime/round-channel.ts::subscribeToRound(roundId, handlers)` opens one channel per round and routes `postgres_changes` to `onScoreChange` / `onRosterChange` / `onRoundChange` / `onStatusChange`. `LiveScoringEntry` uses it:

- **Score events** → dirty-aware merge: if a hole is in `dirtyRef`, the remote value is dropped and the local debounce flushes (last-write-wins by server timestamp).
- **Roster events** → `window.location.reload()` (rare; correctness over elegance).
- **Round → completed** → calls `onClose()` so every connected device leaves the live page.

A Live / Connecting / Offline badge in the shell header reflects subscription status.

### Round Invite Notifications (issue #131)

`src/lib/rounds/notify.ts::notifyPlayersAddedToRound({roundId, playerUserIds, actorUserId})` sends a `round_invite` push to every added player except the actor, deep-linking to `/my-rounds/rounds/{id}/live`. Fires from `POST /api/rounds` and `POST /api/rounds/{id}/players`. Best-effort: errors swallowed. Simulator suppression inherited from `sendBulkNotifications`. No per-type preference toggle yet.

## Cross-Table State Consistency

**IMPORTANT: Always think through cascading side effects when modifying data referenced across multiple tables or components.**

Many logical dependencies aren't enforced by DB foreign keys. Before any delete/remove/reassign, ask: "What other data becomes invalid?"

Common patterns:
- **Contest participants → scramble team members**: removing a participant must also remove them from any scramble team in that contest.
- **Bracket matches → downstream matches**: un-advancing a match must cascade to clear all downstream winner/loser placements.
- **Sibling component state**: when one admin component mutates shared data (e.g., ScrambleManager changes teams), other open components (e.g., ScoringManager) must refresh — use `window.dispatchEvent(new CustomEvent(...))`.

When implementing any delete/remove/reassign:
1. Trace all tables/state that reference the affected entity.
2. Handle cleanup in the same operation, not as an afterthought.
3. Use optimistic UI updates that can be reverted on API failure.
4. Notify sibling components if they might be displaying stale data.

## API & Database Performance

**IMPORTANT: Always minimize database round-trips and HTTP requests.**

1. **Batch inserts/upserts** — `.insert([...rows])`, not a loop.
2. **Batch updates** — single `.update()` with `.in("id", [...ids])`, not a loop.
3. **Combine related operations into one API call** — parent + children in one POST, not 3 sequential client calls.
4. **Parallel fetches** — `Promise.all()` for independent data, not sequential `await`s.
5. **Select only what you need** — `.select("id, name")`, not `.select("*")`.

**Before writing any API route, ask: "How many DB calls does this make?" More than 5 → look for batch opportunities.**

## Spectator / Public Home Page

When adding features to the authenticated home page (`HomeContent.tsx`), always check whether they should also appear on `SpectatorHomeContent.tsx`. The spectator page at `/spectator` is public/no-auth and shows event info, the latest article, and limited quick links (KGB Cup, Course, Articles). It intentionally excludes anything personalized (RSVP, tee times, scoring, financials, action items, chat, notifications, polls).

Spectator sub-pages live under `src/app/(public)/spectator/` and use `createAdminClient()` to bypass RLS. **Only expose truly public data** — never phone numbers, financials, chat, or private user data.

## Verification Checklist

**After completing any implementation task, always provide a verification checklist.** A concise list of manual tests the user can work through to confirm the feature works:

1. **Happy path** — primary use case end-to-end
2. **Edge cases** — empty states, boundary conditions, missing data
3. **Undo/clear** — if there's a reset action, verify it
4. **Cross-user impact** — if other users see the change, verify from another session
5. **Existing functionality** — related features that could regress still work
6. **Database** — if a migration was added, confirm it ran and the schema looks right

## Feature Planning & Issue Tracking

**GitHub Issues are the source of truth for feature planning and persistence.** Use `gh issue create` for new features (overview, UX flow, technical plan, edge cases, acceptance criteria). Reference issues when implementing; close them when done. Draft issue bodies in `docs/issues/` and pass via `--body-file`.

## Feature Documentation

**IMPORTANT: Keep `README.md` up to date with all app capabilities.** When adding/updating/removing features, update the relevant `README.md` section. Include user-facing and admin capabilities, and note any time-gated or visibility-controlled features. README is the definitive reference for what the app can do today.
