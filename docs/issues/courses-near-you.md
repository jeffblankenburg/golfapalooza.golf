## Overview

Add a "Near me" affordance on the round-creation course-search step so a Loozer playing somewhere new can find their course without typing. The backend merges results from our own `courses` cache and from GolfCourseAPI's nearby endpoint, dedupes by `external_id`, and offers a one-tap path to add any uncached course via the existing lookup cascade ([#110](../../issues/110)).

This is a quality-of-life follow-up to [#110](../../issues/110) — that issue solves "I can find my course by name." This issue solves "I don't know my course's exact name and don't want to type."

## Problem Statement

Today, a Loozer arriving at an unfamiliar muni for a summer round has to:
1. Open round creation, type the course name
2. Hope they spelled it right
3. If no match, click "Add a new course," type the name + city + state again, wait for the cascade

For a course they've never played, even step 1 is friction — half the time they don't know whether it's "Royal American Links" or "The Royal American Links Golf Course" or "Royal American GC."

GPS already knows where they are. The course is a quarter-mile away. We can do better.

## User Flow

### Happy path — course is in our DB
1. User opens round creation. The "Select a course" step shows the existing search box and below it a "📍 Near me" button.
2. User taps it. Browser asks for location permission (one-time per device).
3. List re-sorts to show the 5–10 closest courses, distance shown next to each ("0.4 mi", "12 mi"). User picks one.
4. Round flow continues as today.

### Happy path — course is not in our DB but is in GCAPI
1. Same flow through step 3.
2. The list also includes uncached GCAPI courses with a small "+" badge (e.g., "Royal American Links · 0.7 mi · +").
3. Tap one → modal opens to the lookup-cascade confirmation screen with the data pre-fetched (skip the input phase entirely since we already know the name + lat/lng). User confirms → committed → round flow continues.

### Permission denied / unavailable
1. Hide the "Near me" button silently. (Don't badger.) User falls back to typing.

### No nearby courses
1. List shows "No courses within 25 miles. Try the search box." Button stays available for retry.

## Technical Implementation

### Frontend
- **`src/components/my-rounds/RoundForm.tsx`** — add a "Near me" button on the course step. On click:
  - Check `sessionStorage` for cached `{lat, lng, capturedAt}` (15-minute TTL).
  - If miss, call `navigator.geolocation.getCurrentPosition()` once.
  - Call `GET /api/courses?lat=…&lng=…&radius=25`.
  - Render results in the existing list with a `· {miles} mi` suffix and a "+" badge for uncached entries.
  - Tapping a "+" entry opens `CourseLookupModal` in a new "external_id pre-resolved" mode that skips straight to the confirmation step.

### Backend — extend the existing search route
- **`src/app/api/courses/route.ts`** — `GET /api/courses?lat&lng&radius` already documented in CLAUDE.md but not implemented. Wire it:
  - Pull all courses where `latitude` and `longitude` are non-null (cheap; we'll have <2,000 rows for years).
  - Haversine-sort in JS by distance to (lat, lng).
  - Filter to within `radius` miles (default 25).
  - Cap at top 20.
- Optional `&include_external=true` flag → also call `searchGcApiCoursesByLocation(lat, lng, radius)` (already exported from the resurrected client), filter out anything we already have by `external_id`, and merge in the unmatched ones with a flag like `{ source: "gcapi", external_id: "..." }`.

### Backend — pre-resolved lookup commit
The existing `/api/courses/lookup/commit` already accepts a draft and persists it. For the "near me + uncached GCAPI hit" flow, we need to fetch the full course data from GCAPI before showing the confirmation. Two options:
- **Option A**: New endpoint `POST /api/courses/lookup/from-gcapi` with `{ external_id }`, returns the same draft shape as `/lookup` would. Cleaner separation, easy to test.
- **Option B**: Extend `/lookup` to accept `{ external_id }` instead of `{ name, city, state }` and return the same shape. Fewer moving parts.

Recommend Option A — `/lookup` is already doing a lot.

### AI-sourced courses + lat/lng
Currently `normalizeFromAi` sets `latitude: null, longitude: null`. AI-sourced courses won't show up in "Near me" results until we backfill coords. Two ways:
1. Pass the AI's returned `address` + `city` + `state` through `geocodeAddress` (already used for manual entries) inside `persistScorecard`.
2. Have the AI prompt return `latitude`/`longitude` if it can find them. Less reliable.

Recommend #1 — geocode on save, single source of truth.

### Distance display
- Convert meters → miles inline: `Math.round(meters * 0.000621371 * 10) / 10` for "0.4 mi" precision under 10 mi, integer mi above.
- Don't show distance when there's no GPS (i.e., on the regular search results).

### GPS caching
- Store `{lat, lng, capturedAt}` in `sessionStorage` keyed `gp_geo_v1`.
- 15-minute TTL covers a typical "drive to the course → open the app" window without re-prompting on every tap.
- Manual "Refresh location" link in the empty state.

## Edge Cases

- **Permission denied** → hide the button, don't show errors. Users who deny once usually mean it.
- **GPS available but inaccurate** (`accuracy > 5 km`) → still proceed but warn ("Location is approximate").
- **User in a region with sparse GCAPI coverage** → empty result is fine; manual fallback always works.
- **Two users at the same course look up at the same time** → no race; the dedupe in `persistScorecard` already handles it.
- **AI-sourced courses with no coords** → see "AI-sourced courses + lat/lng" above.
- **GCAPI nearby returns a course we have but with mismatched `external_id`** (manual courses we added before linking) → fall back to a name + state fuzzy match for dedup. Acceptable for v1.
- **Roaming user crosses state lines mid-trip** → cache TTL handles it within 15 minutes, manual refresh otherwise.

## Privacy

- Location is requested only on explicit user action (button tap), never on page load.
- Coordinates never leave the request — not stored on the user record, not logged, not sent to OpenRouter.
- One-line copy in the button or near it: "Used only to find courses, not stored."

## Acceptance Criteria

- [ ] "📍 Near me" button visible on the round-creation course step
- [ ] Tapping it requests location once, caches in sessionStorage for 15 min
- [ ] Returns up to 20 courses within 25 mi, sorted by distance ascending
- [ ] Each result shows distance ("0.4 mi", "12 mi")
- [ ] Uncached GCAPI courses appear with a "+" badge and skip the lookup-input step on tap
- [ ] AI-sourced courses get backfilled `latitude`/`longitude` via Mapbox geocoding on commit
- [ ] Permission denied gracefully hides the button (no error toast)
- [ ] CLAUDE.md updated to document `GET /api/courses?lat&lng&radius` and the new `/lookup/from-gcapi` endpoint

## Open Questions

- Default radius: 25 mi feels right for a typical drive but might be too small for a destination-trip Loozer. Make it configurable later? (Lean: ship with 25, add a slider only if asked.)
- Distance unit: stick with miles (we're US-only per [#110](../../issues/110))? Or future-proof for km via a user preference? (Lean: hardcode miles, defer i18n.)
- Show "Near me" persistently or only when the search box is empty? (Lean: always, so a user who typed but found nothing can swap to GPS without clearing.)
- Backfill existing AI-sourced courses with coords via a one-time script, or only do new ones going forward? (Lean: one-time backfill — write a small node script, similar to `scripts/test-gcapi-coverage.mjs`.)

## Related

- [#109](../../issues/109) — AI-assisted data entry umbrella
- [#110](../../issues/110) — AI scorecard lookup for summer qualifying rounds
