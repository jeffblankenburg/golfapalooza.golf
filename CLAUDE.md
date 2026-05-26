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
| GET | `/api/rounds/recent?limit={n}` | Cross-Loozer feed of recently completed player-rounds for the home page Recent Rounds card scroller. One row per (round, player); filters out system + financial-only users. Default limit 25, max 50. |
| PUT | `/api/rounds/{roundId}/edit` | Post-completion edit for a saved round — body `{round_date?, player_tees?, player_scores?}`. Permission: any player in the round or admin (issue #130). Updates date, per-player tee_id, and per-hole strokes/putts in one call, then recomputes gross/adjusted/differential for every affected player and triggers handicap recalc. Stamps `rounds.edited_at` + `edited_by`. |
| POST | `/api/rounds/{roundId}/players` | Add a Loozer to an existing round. Body `{user_id, tee_id?}`. Any player in the round or admin (#130). 409 if the user is already on the roster. |
| DELETE | `/api/rounds/{roundId}/players/{playerId}` | Remove a player from a round (`playerId` is `round_players.id`). Cascades to the player's `round_scores`. If the removed player was the last one, the round is deleted too — response includes `round_deleted: true`. |

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
| GET | `/api/admin/attendance/grid` | Loozer × trip attendance matrix. Returns `trips`, `loozers`, and `roster` rows (`event_participants` where `on_roster=true`). Powers `/admin/attendance`. |
| PUT | `/api/admin/attendance/cell` | Body: `{userId, tripId, attended}`. Toggles a single roster cell — checking sets `on_roster=true` and `likelihood=99`; un-checking sets `on_roster=false` and preserves `likelihood`. Idempotent. |
| GET | `/api/admin/history/verify` | Cross-check imported accolades against the workbook's Summary sheet. Per-category and per-user diff. Cornhole doubles imports are doubled in the Summary comparison (Summary credits both teammates; Awards sheet stores one row per team). |
| GET | `/api/admin/accolades/categories` | List the editable accolade category metadata (title, short_label, icon, description, sort_order) used by profile pages and the public `/accolades` gallery. |
| PUT | `/api/admin/accolades/categories/{category}` | Update one category's display fields. Body: `{title?, short_label?, icon?, description?, sort_order?}`. |
| POST | `/api/admin/accolades/categories/{category}/badge` | Upload a badge image (multipart, `file`). Replaces the existing badge; sets `icon_url`. |
| DELETE | `/api/admin/accolades/categories/{category}/badge` | Remove the badge image and revert to the emoji icon. |
| GET | `/api/admin/analytics-overview?days={7\|14\|30}` | Admin-friendly analytics for the selected window: per-day breakdown (users/page-views/logins/chat/scores/uploads/notifications/errors), window totals for each metric, Loozers who have not installed the PWA, and Loozers inactive for that same window. Single `days` param drives every section of the page. Gated by `checkAnyPermissionAccess`. Powers `/admin/analytics`. |
| GET | `/api/admin/analytics-overview/day?date=YYYY-MM-DD` | Per-day breakdown for the analytics drill-down: full event counts + active Loozers (with their per-event-type counts) + top pages. Same auth gate. |
| GET | `/api/admin/financials/payout-events?trip_id=` | Issue #103. List payout-sheet rows for a trip (defaults to active) with computed `participant_count` and `total = amount × count × days` per row. Powers `/admin/financials/payout-events` and the Payout Denominations tab on `/admin/financials/grid`. |
| POST | `/api/admin/financials/payout-events` | Create a payout-sheet row (admin-editable cash-needed event). |
| PUT | `/api/admin/financials/payout-events/{id}` | Update a row — any subset of label/sort_order/source/source_ref/source_filter/amount/day_count/is_payout/notes. |
| DELETE | `/api/admin/financials/payout-events/{id}` | Delete a row. |
| GET | `/api/admin/financials/payout-grid?trip_id=` | Issue #103 Phase 2. Loozer × event payout grid for a trip. Returns `{loozers, events, cells}` where cells are derived live from existing winner sources (scramble_teams gross_score ordering for Team payouts, calcSkins for Skins, daily_contest_winners for CTP/LD/LP, hundred_feet_scores for 100 ft, pickem rankings for PickEm). Paid status read from `payout_paid_status` (and `pickem_payouts` for Pickem cells). Powers the Winners tab on `/admin/financials/grid`. |
| PUT | `/api/admin/financials/payout-grid/cell` | Toggle paid status for a cell. Body: `{trip_id, user_id, event_key, paid, pickem_contest_id?}`. Pickem cells route to `pickem_payouts`; everything else upserts `payout_paid_status`. |
| GET | `/api/admin/financials/cost-items?trip_id=` | Issue #125 Phase 1. List `cost_items` for a trip (admin-only). Defaults to active trip. Powers `/admin/financials/cost-items`. |
| POST | `/api/admin/financials/cost-items` | Create a cost item. Body: `{trip_id, name, cost, category?, included_in_trip_cost?, sort_order?, notes?}`. |
| PUT | `/api/admin/financials/cost-items/{id}` | Update fields on a cost item. |
| DELETE | `/api/admin/financials/cost-items/{id}` | Delete a cost item. |

## Database Schema

### Tables

- `users` - User profiles (display_name, phone, full_name, `is_founder`, `sponsor_id` self-FK for the Loozer family tree, `workbook_name` join key from the historical Golfapalooza workbook for issue #114 — unique when set, `city`/`state`/`latitude`/`longitude`/`geocoded_at`/`show_on_map` for the `/loozers` Map tab — issue #120)
- `courses` - Cached golf courses; `source` ∈ ('manual','gcapi','ai'), `verified` flag, `lookup_key` for cross-user dedup
- `course_tees` - Tee boxes with ratings (course_rating, slope_rating); `confidence` jsonb for AI-extracted ratings
- `course_holes` - Hole details (par, handicap_index, yards)
- `rounds` - Scoring sessions (`edited_at` + `edited_by` track post-completion edits made via `/api/rounds/{id}/edit`)
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
- `payout_sheet_events` - Issue #103. Per-trip configurable rows for the payout/cash-needed sheet. Each row has a `label`, `participant_source` (`option` / `option_value` / `scramble` / `all_attendees` / `pickem_payments` / `manual`), optional `source_ref` (option_id or contest_id), optional `source_filter` JSONB (e.g. `{choice_values: [...]}` for option_value, `{count: N}` for manual), `amount_per_participant`, `day_count`, and `is_payout` flag (false = cash to pay for the event itself, e.g. KGB Cup pass-through). Read by `/admin/financials/payout-events`, the Payout Denominations tab on `/admin/financials/grid`, and `/api/skins` (per-player Skins amount). Admin-managed. Seeded by `scripts/seed-payout-sheet-events.mjs`.
- `payout_paid_status` - Issue #103 Phase 2. Per-cell paid checkbox storage for the Loozer × event Winners grid. Keyed by `(trip_id, user_id, cell_key)` where `cell_key` = the `payout_sheet_events.id` for that column. Pickem cells are excluded — Pickem keeps using its existing `pickem_payouts.paid_out` (read-through, never written here). Toggled via `PUT /api/admin/financials/payout-grid/cell`.
- `cost_items` - Issue #125 Phase 1. Bookkeeping ledger of every line item that comprises a trip's costs. Per-trip rows with `name`, `cost`, `category` (lodging/food/operational/event_pot/option_entry/pass_through/other), `included_in_trip_cost` (true = bundled into the bulk Trip Cost the option charges everyone). **Admin-only — never surfaced to Loozers**, who continue to see "Trip Cost: $651" as an opaque lump. Phase 1 is purely additive; Phases 2–5 will backfill from existing amounts and migrate consumers (`trip_options.choices[].cost_item_ids`, `contests.buy_in_cost_item_id`) to point at this catalog. Admin manages at `/admin/financials/cost-items`.

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
- `00132_event_attendance.sql` - `event_attendance(user_id, trip_id, source)` table — original home for historical workbook attendance. **Superseded by 00133** below; reads now go through `event_participants` and the workbook importer also writes there. The table is left in place as a backup; a future migration may drop it.
- `00133_unify_attendance.sql` - Backfills `event_participants` from `event_attendance` so a single source (`event_participants.on_roster=true`) covers both modern and historical attendance. The `/admin/attendance` matrix, the lifetime "events attended" count on profile / tree / loozers grid, the per-event Roster accordion, and the historical workbook importer all read and write through this one table now. Adding someone to the active event's roster bumps their count immediately, with no archival step needed.
- `00134_contest_bracket_format.sql` - `contests.bracket_format` (default `'double-elimination'`) drives doubles cornhole bracket generation. Allowed values: `double-elimination` (winners + losers + championship; current default), `single-elim-finals-bo3`, `single-elim-all-bo3`, `single-elim-semis-bo3`. Singles ignores this column and always generates a single-elim bracket with a best-of-3 final. The format picker lives on the doubles `CornholeBracketManager` and is locked once a bracket exists (admin must reset to change). `/api/admin/cornhole/bracket` POST accepts an optional `bracket_format` and persists it on the contest before generating; series rounds get `series_best_of=3` set after insert (final only / every match / semis+final, depending on format).
- `00135_payout_sheet_events.sql` - Issue #103. Adds `payout_sheet_events` table for the admin-editable payout/cash-needed sheet. Per-trip rows with `participant_source` discriminator, `source_ref` to options or contests, optional `source_filter` JSONB, `amount_per_participant × day_count`. RLS-locked: read for any authenticated user, write for `manage_finances`. Run `node scripts/seed-payout-sheet-events.mjs` afterwards to populate the active trip's 17 default rows.
- `00136_payout_paid_status.sql` - Issue #103 Phase 2. Adds `payout_paid_status` table for the Winners-grid per-cell "paid" checkbox. Keyed by `(trip_id, user_id, cell_key=payout_sheet_events.id)`. Same RLS gate as 00135. Pickem cells continue to use `pickem_payouts.paid_out` so existing Pickem flows aren't disturbed.
- `00137_payout_sheet_events_winner_source.sql` - Issue #103 follow-up. Adds explicit `winner_source` enum + `winner_day_number` columns to `payout_sheet_events`. Replaces fragile label-substring matching in the grid aggregator with a discriminator the admin sets explicitly. Includes one-shot backfill from current labels.
- `00138_cost_items.sql` - Issue #125 Phase 1. Adds `cost_items` table — universal source of truth for every dollar in the system. Standalone catalog (no FK back to consumers); FK references live on consumer tables (`contests.buy_in_cost_item_id`, `trip_options.choices[].cost_item_ids`). Phase 1 is purely additive; nothing reads it yet.
- `00139_cost_item_links.sql` - Issue #125 Phase 3a. Adds `cost_items.linked_option_id` FK + `cost_item_option_choices` junction table so each cost item can fund a specific option (and optionally specific choice values on that option). Powers the link UI in OptionBuilder and the `computeOptionCosts` helper.
- `00140_payout_sheet_events_cost_item.sql` - Issue #125 Phase 3 (continued). Adds `payout_sheet_events.cost_item_id` FK so leaderboards (Skins, Winners grid, Denominations tab) derive their per-participant amounts from cost_items. Stored `amount_per_participant` remains as a fallback for unlinked rows (e.g. Lodge Mon/Tue, whose per-stayer cash aggregates multiple cost_items).
- `00141_payout_splits.sql` - Issue #124 Phase A precursor. Adds `payout_sheet_events.payout_splits` JSONB column so per-row pot-split rules live with the row instead of being implicit. Same shape as `src/lib/payout-events/splits.ts` `PayoutSplit` type.
- `00142_contests_as_spine.sql` - Issue #124 Phase A. Contests become the spine of "what gets played and who wins": adds `contests.buy_in_cost_item_id` (FK to `cost_items` — what does entry cost?), `contests.parent_contest_id` (e.g. Skins lives inside a Scramble day), `contests.payout_splits` (how the pot is carved up), and `payout_sheet_events.contest_id` (bridge column). Belt-and-suspenders cycle guard prevents a contest from being its own parent.
- `00143_unified_contest_winners.sql` - Issue #124. `contest_winners` becomes the single source of truth for who won what and what's paid out. Replaces the per-contest-type winner tables (`daily_contest_winners`, `pickem_payouts`, `payout_paid_status`) with one keyed by `(contest_id, place, user_id)` + `paid` flag.
- `00144_phase_f_cleanup.sql` - Issue #124 Phase F (between trips). Destructive cleanup. Drops `payout_sheet_events.{winner_source, winner_day_number, payout_splits, cost_item_id}` (moved to `contests`), `pickem_settings.payout_json` (moved to `contests.payout_splits`), and the legacy winner tables `daily_contest_winners` / `pickem_payouts` / `payout_paid_status` (replaced by `contest_winners`). The reads/writes that targeted these landed in the prior commit.
- `00145_trip_settings_test_status.sql` - Issue #126 admin sandbox. Extends `trip_settings.status` CHECK to include `'test'`. The test event is invisible to Loozers (all user-facing queries filter `status='active'`); admins access it via the `sim-trip-id` cookie + `getEffectiveTripId()` helper.
- `00146_trip_options_auto_trip_cost.sql` - Issue #125 follow-up. Adds `trip_options.auto_include_trip_cost_items` (later superseded by 00147). Bootstraps the auto-derived "Trip Cost" option: when set, the option's cost = `SUM(cost_items.cost) WHERE included_in_trip_cost=true`. Admin no longer manually links every new trip-cost item to the Trip Cost option.
- `00147_trip_cost_option_type.sql` - Issue #125 follow-up. Promotes "Trip Cost" from the boolean flag added in 00146 to its own `option_type='trip_cost'`. Cleaner dispatch alongside `checkbox` / `select` / `multi_select` / `quantity`. UPDATEs existing rows, then drops `auto_include_trip_cost_items`.
- `00148_phase_5_cleanup.sql` - Issue #125 Phase 5 (between trips). Destructive cleanup of legacy cost columns now that every consumer reads through `cost_items` (computeOptionCosts + getPickemEntryFee + loadPayoutSheet). Strips `cost` from `trip_options.choices` JSONB (one-shot UPDATE), drops `trip_options.cost`, drops `pickem_settings.entry_fee`. **Kept on purpose:** `payout_sheet_events.amount_per_participant` remains as a fallback for Lodge Mon / Lodge Tue rows that aggregate multiple cost_items per stayer (no single FK fits). The `scripts/audit-option-cost-coverage.mjs` confirmed every paid option on active + test trips was linked before this migration ran; the dropped values were already inert (overlaid by cost_items reads).
- `00149_contests_declared_no_winner.sql` - Adds `contests.declared_no_winner BOOLEAN DEFAULT FALSE`. Distinguishes "explicitly nobody won" from "not yet decided" on daily contests (CTP front/back, Long Drive). Long Putt always has a winner; the flag is meaningful only for the three carry-eligible types. Drives the per-day pot carry chain implemented in `src/lib/winners/daily-pots.ts`: same-day fold (one CTP side void → other side takes both shares), cross-day carry ($5 rule splits Front/Back), and Saturday forfeit (next-event budget). The admin gesture lives in `DailyWinnersManager` as a "🚫 No winner (pot carries)" option in the winner dropdown; the API at `/api/admin/daily-winners` re-runs `materializeDailyContestChain` after every change so all downstream contest_winners.amount values stay in sync.
- `00150_chat_images_bucket.sql` - Creates the `chat-images` Supabase Storage bucket for in-chat photo uploads. Public read so chat images render with plain `<img>` tags; authenticated insert so any signed-in Loozer can upload (path is `${room_id}/${timestamp}-${filename}`); owner-only update/delete so each uploader controls their own file. The `MessageInput` component has used this bucket name since shipping but the bucket itself wasn't provisioned until now.
- `00154_rounds_edited.sql` - Editable scorecards (post-completion). Adds `rounds.edited_at TIMESTAMPTZ` + `edited_by UUID REFERENCES users(id) ON DELETE SET NULL`. Powers the "Edited" badge on round detail pages and audit-trails who made the last change. Set by `PUT /api/rounds/{id}/edit`. Per-hole audit isn't kept; the live `round_scores` row is authoritative.
- `00155_song_play_counts.sql` - Adds `song_play_counts()` and `song_favorite_counts()` SQL functions that return `(song_id, count)` aggregates. Used by `/api/admin/songs` instead of fetching every `song_plays`/`song_favorites` row and counting in JS — that approach silently truncated to 1000 rows (the PostgREST default) once `song_plays` crossed 1000. Both functions are `STABLE` and granted to `authenticated, service_role`.
- `00156_realtime_rounds.sql` - Issue #132. Adds `round_scores`, `round_players`, and `rounds` to the `supabase_realtime` publication so the live scorer can subscribe to changes from other devices. Idempotent guards via `pg_publication_tables` so re-runs are safe.

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

## Co-Equal Round Ownership

Issue #130: a round has no single "owner" once it's been created. Every player on the roster (and every app admin) has equal rights to:

- edit hole scores while the round is in-progress or after it's completed (`/api/rounds/{id}/scores` and `/api/rounds/{id}/edit`)
- complete the round on behalf of the group (`PUT /api/rounds/{id}`)
- add or remove other players (`POST /api/rounds/{id}/players`, `DELETE /api/rounds/{id}/players/{playerId}`)
- delete the round entirely (`DELETE /api/rounds/{id}`)

`rounds.created_by` is preserved for attribution (the "Started by …" line on the detail page) but no API surface gates on it any more. The shared gate lives in `src/lib/rounds/access.ts` (`canManageRound(roundId, userId)`) and is called from every mutation route — it uses `getEffectiveUserId` so simulator mode is honored, and routes its writes through the admin client so RLS doesn't silently no-op against a non-creator scorer. Destructive actions (delete round, remove last player) gate behind a `ConfirmModal` on the detail page.

## Live Scoring Realtime Sync

Issue #132: when two devices in the same group both have the live scorer open, score edits sync between them within ~1 second. Implementation:

- Migration `00156_realtime_rounds.sql` adds `round_scores`, `round_players`, and `rounds` to the `supabase_realtime` publication (idempotent — safe to re-run).
- `src/lib/realtime/round-channel.ts` exposes `subscribeToRound(roundId, handlers)` returning an unsubscribe fn. Opens one channel per round and routes `postgres_changes` to three optional handlers: `onScoreChange`, `onRosterChange`, `onRoundChange`. Also reports `onStatusChange` for the Live/Connecting/Offline badge.
- `LiveScoringEntry` subscribes on mount and:
  - **Score events** → dirty-aware merge into local `scores`/`putts` state. If a hole is currently dirty in `dirtyRef`, the remote value is ignored — the local debounce will flush and win (last-write-wins is enforced by server timestamp).
  - **Roster events** → `window.location.reload()` so the parent page refetches and remounts with fresh players. Heavy but correct; roster changes are rare.
  - **Round status flip to `completed`** → calls `onClose()` so every connected device leaves the live page.
- Subscription status drives a small **Live / Connecting / Offline** badge in the scoring shell header so the user knows whether their session is in sync.

RLS already permits SELECT for any player in the round (`is_round_player(round_id)` on `round_scores`/`round_players` and `created_by OR is_round_player` on `rounds`), so Realtime subscriptions work without policy changes.

## Round Invite Notifications

Issue #131: every player added to a round (except the actor who took the action) receives a `round_invite` push notification with a deep link straight into the live scorer (`/my-rounds/rounds/{id}/live`). Fires from both `POST /api/rounds` (initial roster) and `POST /api/rounds/{id}/players` (mid-round add). The helper lives at `src/lib/rounds/notify.ts` — `notifyPlayersAddedToRound({roundId, playerUserIds, actorUserId})` — and is best-effort: it swallows errors so a flaky notification service never blocks round creation. Simulator suppression is inherited from `sendBulkNotifications`. The in-app `NotificationDrawer` and the service worker (`public/sw.js`) both route the click to `data.url` / `data.round_id`. No per-type preference toggle yet — add one alongside other notification preferences when that surface ships.

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
