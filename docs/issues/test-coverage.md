# Feature: Test infrastructure — unit + integration coverage end-to-end

## Overview

Stand up a real automated test suite for this app. Today there is none — verification is done via `npx tsc --noEmit`, `npm run build`, manual browser testing, and a handful of throwaway `scripts/test-*.mjs` validators for one-off concerns (course lookup, KGB schedule, contest-spine sweep). That's worked while the codebase has been small enough to hold in one head, but with #124 + #125 + #126 done and #85 / #88 / #89 / #114 still ahead, the cost of "what did I just break?" is climbing fast.

This issue scopes a tiered test strategy that gets meaningful coverage without pretending we can hit 100% on day one.

## Why now

- **#126 (the admin sandbox) explicitly defers a 25-check "validation suite"** that runs across the trip data. That suite is half of an integration test layer; might as well build it under a real framework rather than as a one-off.
- **Recent refactors had no automated way to catch regressions.** The #124 contest-spine refactor, the #125 cost-items consolidation, and the #126 `getEffectiveTripId()` sweep were each "type-check + build + manual smoke." That works once; it doesn't scale to weekly refactors.
- **Payout / financial code is now where breakage is most expensive.** Skins payouts, scramble splits, daily contest amounts, Pickem payouts — these directly affect money. They need tests.
- **AI scorecard lookup, AI-driven course import, and the future generator system (#126 Phase 2)** all have inputs that can drift silently. Tests pin them down.

## Tiered scope

There is no honest way to "cover the entire application front-to-back" in one project. This issue carves out four tiers and ships them in order; each is independently valuable.

### Tier 1 — Pure-logic unit tests (Vitest)

Functions with no I/O, no side effects. The highest-ROI testing layer for this codebase because so much of the value is in computation: payouts, handicaps, skins, splits, scoring.

Targets:
- `src/lib/handicap/*` — USGA differential math, course handicap, scramble team handicaps, net double bogey caps
- `src/lib/skins.ts` — `calcSkins` (skin allocation, ties, no-winner case)
- `src/lib/payout-events/splits.ts` — `computePayoutSplits` (flat amounts, percentages, remainder, rounding)
- `src/lib/payout-events/denominations.ts` — bill-denomination math
- `src/lib/pickem/rankings.ts` + `pickem/payouts.ts` — rank computation, tie-share, $5-rounded payouts
- `src/lib/winners/scramble.ts` / `cornhole.ts` / `bspitw-scoring.ts` — winner-resolution logic, scorecard playoff
- `src/lib/history/parse-workbook.ts` — historical XLSX parser (already has structured input)
- `src/lib/audience.ts` — poll audience resolution
- `src/lib/courses/scorecard.ts` — `buildLookupKey`, `normalizeFromGcApi`, `normalizeFromAi`
- `src/lib/strip-markdown.ts`, `src/lib/birthday/today.ts`, `src/lib/visibility.ts`

**Effort:** 5–7 days. Vitest setup + ~80–120 focused tests across these files.

**Value:** catches off-by-one bugs in money math, tie-breaking, and ranking. Runs in milliseconds. No DB needed.

### Tier 2 — Integration tests against a local Supabase (Vitest + Supabase CLI)

Tests that exercise the actual database schema, RLS, materializers, and migrations. The Supabase CLI is already a dev dependency (`"supabase": "^2.72.8"`), so the runtime is available. We start the local instance, run migrations, seed a known test trip, and exercise the materialize + read paths.

Targets:
- All `src/lib/winners/materialize.ts` functions end-to-end against a real schema (scramble, skins, daily contests, 100 feet, pickem, cornhole)
- `src/lib/payout-events/compute.ts` `loadPayoutSheet` against seeded data
- `src/lib/payout-events/grid-v2.ts` `loadPayoutGridV2` end-to-end
- Migration round-trip: every migration in `supabase/migrations/` runs cleanly from empty schema
- `src/lib/loozers/profile-data.ts` `loadLoozerProfile` against a seeded user
- `src/lib/loozers/list-data.ts` `loadLoozerList`
- Audience resolution + poll eligibility against real `event_participants` rows
- Course lookup cascade (`/api/courses/lookup`) with the GolfCourseAPI step mocked

**Effort:** 7–10 days. Setup of local Supabase test harness, seed fixtures, ~30–50 integration tests.

**Value:** catches the kinds of bugs that types and unit tests miss — wrong column names after a migration, RLS denying a query the helper expected to succeed, materializer writing the wrong amount because a join was off.

### Tier 3 — API route tests (Vitest + Next.js test handler)

Exercise the Next.js API routes themselves against the local Supabase. This is where "the whole stack works end-to-end" gets verified — route → server-side query → response shape.

Targets (the highest-traffic / highest-stakes routes):
- `POST /api/rounds` + `PUT /api/rounds/{id}/scores` + `POST /api/rounds/{id}/complete` (handicap pipeline)
- `POST /api/auth/send-otp` (auth flow)
- `POST /api/selections` (option selection + contest enrollment)
- `POST /api/admin/scramble/calculate-handicaps` (mixed-tee handicap math)
- `POST /api/admin/cornhole/bracket` (bracket generation)
- `PUT /api/admin/financials/payout-grid/cell` (paid-status toggle)
- `POST /api/polls/{id}/respond` (poll validation)
- `GET /api/admin/financials/payout-grid` (Winners grid loader)
- `POST /api/cron/polls-lifecycle` and `/api/cron/birthday-posts` (cron idempotency)

**Effort:** 5–7 days for ~25–40 route tests using `next/test` or a thin fetch wrapper against `next start`.

**Value:** the most realistic test of the surfaces that real users hit. Catches request/response shape drift, auth/permission misalignments, and bugs that span multiple internal helpers.

### Tier 4 — Browser end-to-end tests (Playwright, selective)

Real-browser tests that exercise critical user journeys. Expensive to maintain, so this tier is the most selective — we cover only the journeys where a bug would cost the user real money or a real bad experience.

Targets:
- Sign-in OTP flow → land on home page
- Submit a round score → handicap recomputes
- Make an option selection during the active window
- Bid on a Calcutta team during the auction (relies on real-time channel)
- Submit a Pickem pick before the deadline
- Live-scoring entry: open a hole, save scores, navigate to the next
- Admin: create a contest, attach a cost item, see it surface on a leaderboard
- Spectator: load the public spectator pages, confirm no auth required

**Effort:** 4–6 days. Playwright setup + ~10–15 end-to-end journeys against a deployed preview or local server.

**Value:** catches integration issues across client + server + real-time + browser quirks (PWA install, mobile viewport, etc.) that unit + API tests don't see.

## What's deliberately out of scope

- **Visual regression tests** (Percy / Chromatic). High maintenance cost for a small visual surface that changes often. Manual QA is cheaper here.
- **Load testing.** Tournament-time concurrency is ~50 simultaneous users max. Vercel handles it; load testing has near-zero ROI.
- **100% line coverage as a target.** Coverage as a metric leads to bad tests. We measure "every payout-bearing code path has a test" instead.
- **Tests for the simulator generator system (#126 Phase 2).** Those will be tests *of* a test-data-generation system; layering tests on top of generators introduces meta-fragility. The generators themselves are validated by Tier 2 (materializers + leaderboards reading them).
- **Mobile-native tests.** This is a PWA; the browser tests in Tier 4 cover mobile viewports.

## CI integration

- Tier 1 + Tier 2: run on every PR. Should finish under 2 minutes.
- Tier 3: run on every PR. Adds another 2–3 minutes.
- Tier 4: run on PRs that touch routes/pages OR nightly against main. Playwright is slow; not worth on every push.

GitHub Actions workflow:
```yaml
- vitest run                    # Tier 1 (unit, ~30s)
- supabase db start             # local DB for Tier 2+3
- vitest run --config integration.config.ts  # Tier 2 + 3 (~3–4 min)
- playwright test --grep "@smoke"  # Tier 4 smoke only on PRs (~1 min)
```

Tier 4 full suite runs nightly.

## Architectural decisions worth locking in upfront

- **Framework: Vitest.** Faster than Jest, native ESM, native TypeScript, works with Next.js out of the box. The codebase is already on modern tooling; Jest is unnecessary baggage.
- **Local Supabase for integration tests.** Supabase CLI already in deps. Spin up via `supabase db start`. Migrations apply from `supabase/migrations/`. Seed data via a fixture script that ships with the test suite.
- **Test database isolation.** Every integration test gets a transaction that rolls back on teardown — no per-test DB reset (slow). Or: per-suite truncation of the tables touched. Vitest's `beforeEach` + Supabase's RLS-bypassing service role makes this clean.
- **Mock policy.** Mock external APIs (GolfCourseAPI, OpenRouter, Mapbox, web-push, Twilio if it comes back). **Never mock our own database or our own helpers** — that's where bugs live.
- **Browser tests against a deployed preview.** Playwright tests run against a Vercel preview deploy, not against a local `next start`. Catches deploy-time issues (env vars, edge runtime quirks) that local testing misses.
- **Test naming convention.** Co-locate unit tests with the file they test: `src/lib/skins.test.ts` next to `src/lib/skins.ts`. Integration tests under `tests/integration/`. Browser tests under `tests/e2e/`.
- **No snapshot tests for anything that isn't a pure transformation.** Snapshot tests on UI components are pure churn.

## Phases

### Phase 1 — Framework setup + Tier 1 foundation
- Install Vitest, configure for Next.js / React 19 / TypeScript
- Write the test-runner config (`vitest.config.ts`) with appropriate module resolution + path aliases
- Add `npm test` script
- Establish the test-co-location convention
- Write tests for the 5 highest-stakes pure-logic files: `splits.ts`, `skins.ts`, `payouts.ts` (pickem), `handicap`, `scramble.ts` winner resolution
- Hook into CI via GitHub Actions
- Document the testing approach in CLAUDE.md

### Phase 2 — Tier 1 completion + Tier 2 setup
- Round out unit tests for the remaining pure-logic files
- Stand up the local-Supabase integration test harness
- Write the first round of materializer integration tests (scramble, skins, daily contests)

### Phase 3 — Tier 2 + Tier 3
- Complete materializer + helper integration tests
- Start API route tests for the highest-stakes endpoints (rounds, scoring, selections, financial)

### Phase 4 — Tier 4
- Playwright setup against preview deploys
- ~10–15 critical-path browser journeys

## Acceptance criteria

- [ ] Vitest installed and `npm test` runs in <30s for Tier 1
- [ ] CI runs Tier 1 + Tier 2 on every PR; failures block merge
- [ ] Every file under `src/lib/payout-events/` has unit-test coverage of its public functions
- [ ] Every materializer in `src/lib/winners/materialize.ts` has an integration test that seeds data, runs the materializer, and asserts `contest_winners` rows
- [ ] `loadPayoutGridV2`, `loadPayoutSheet`, `loadLoozerProfile`, `loadLoozerList` each have an integration test
- [ ] At least 10 high-stakes API routes have route tests against the local Supabase
- [ ] Playwright covers: sign-in OTP, round-score-save, option selection, Calcutta bid, Pickem submission, live-scoring entry
- [ ] Test coverage documented in CLAUDE.md so future agents/contributors know what to add tests for
- [ ] Run-locally instructions in README

## Decisions locked in (2026-05-10)

- **Test runner: Vitest.** Best ESM + TypeScript + Next.js story; no second runtime.
- **CI: GitHub Actions.** Full control over the Supabase-CLI setup; integrates cleanly with `gh`.
- **Test locations:**
  - Tier 1 (unit) — **co-located** with source: `src/lib/skins.test.ts` next to `src/lib/skins.ts`. Developers reach for the test immediately when editing.
  - Tier 2 (DB integration) — `tests/integration/` (separate harness, slower runtime).
  - Tier 3 (API routes) — `tests/api/`.
  - Tier 4 (browser) — `tests/e2e/`.
- **No coverage gate.** Coverage is reported but not enforced — gates produce bad tests. We measure "every payout-bearing code path has a test" instead.

## Effort estimate

- Phase 1 (framework + Tier 1 foundation): **3–4 days**
- Phase 2 (Tier 1 done + Tier 2 harness): **5–7 days**
- Phase 3 (Tier 2 + Tier 3 complete): **7–10 days**
- Phase 4 (Tier 4 selective Playwright): **4–6 days**

Total: **~3–4 calendar weeks active coding** to reach meaningful coverage. The bulk of the value lands by end of Phase 2 — payout / handicap / materializer correctness is the most expensive class of bug, and Tier 1 + early Tier 2 cover most of it.

## Dependencies

- Independent of every other open issue. Can ship anytime; benefits compound the longer the codebase grows.
- Provides leverage for #126 (sandbox simulator), #85 (duplicate event), #88 (career stats), #114 (historical import) — all four are easier to validate with a real test suite underneath them.
