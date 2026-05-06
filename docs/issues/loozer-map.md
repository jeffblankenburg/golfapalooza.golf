## Overview

Add a **Map** view to `/loozers` (alongside the existing **Grid** | **Tree** toggle) that plots every Loozer on a zoomable, pannable Mapbox map using their saved city/state. A "📍 Use my location" button — same pattern as the round-creation "Near me" affordance — recenters the map on the current device's GPS so a traveling Loozer can see who lives nearby.

This builds on the city/state fields already on `users` (migration `00012_add_profile_fields.sql`). Self-edit lives in `ProfileEditor.tsx`; admin edit was added in [parent PR/commit].

## Problem Statement

Loozers travel for work and vacation. Today there's no way to discover that another Loozer lives 20 minutes from your hotel. The "family tree" answers *who brought me in*; the map answers *who's around me*.

The data we need is mostly already there — most Loozers fill out city/state in their profile. We just don't surface it spatially.

## User Flow

### Happy path
1. User opens `/loozers`. Existing "Grid | Tree" toggle becomes "Grid | Tree | Map".
2. Tap **Map**. A full-bleed Mapbox map renders, fit-bounds around all Loozers with known locations.
3. Each Loozer with a city is a clustered marker (Mapbox cluster source). Zooming in expands clusters to individual avatar pins.
4. Tap a pin → bottom sheet with avatar, name, city/state, distance from you (if GPS granted), and a "View profile" link.
5. **📍 Use my location** button (top-right of map). On tap: requests geolocation once, drops a "you" pin, recenters/zooms to ~50 mi radius, sorts the bottom-sheet list by distance.
6. View choice persists in `localStorage` like Grid/Tree does today.

### Loozer with no city set
- Excluded from the map silently. A small footer chip: "*3 Loozers haven't set a location — [edit yours]*" linking to the profile editor.

### Permission denied / unavailable
- "Use my location" button stays visible but shows the unavailable state. Map still works; just no "you" pin and no distance sorting.

### Spectator page
- **No map.** `/spectator` excludes anything personalized — same rule that excludes the family tree today.

## Technical Implementation

### Schema

**Migration `00122_user_geocode.sql`** — cache geocoded coordinates so we don't hit Mapbox on every page load:
```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS geocoded_at timestamptz;
-- geocoded_at is the city/state value that produced these coords; if it differs
-- from the current city/state we re-geocode. Keep it null when city/state is null.
```

(City precision is already coarse — single-decimal lat/lng would be ~7 mi resolution and probably overkill protection, but worth a brief discussion before merge.)

### Geocoding

`src/lib/geocode.ts` already wraps Mapbox Geocoding. Two write points need to invalidate + refill:
- **`/api/profile` (self-edit)** and **`/api/admin/users` PUT (admin edit)** — when `city` or `state` changes (or either becomes null), call `geocodeAddress({ city, state })` and update `latitude`/`longitude`/`geocoded_at` in the same `update()` call. If geocode returns null, set lat/lng to null. Failures are non-fatal; log + proceed.
- One-time backfill: `scripts/backfill-loozer-geocode.mjs` walks every user with `city` + `state` but null `latitude`, geocodes, writes. Idempotent. Rate-limit Mapbox (10 req/sec is fine).

### API

**`GET /api/loozers/locations`** — returns `[{ id, display_name, avatar_url, city, state, latitude, longitude }]` for every non-financial-only, non-system user with non-null coordinates. Authenticated only. Cache server-side for 5 min — this set rarely changes.

### Frontend

**`src/components/LoozerMap.tsx`** (new) — uses `react-map-gl` (`mapbox-gl` already a transitive dep via `HoleMapView.tsx`). Verify that — if not present, install. Components:
- `<Map>` with `mapbox-gl` style `streets-v12`, `accessToken={NEXT_PUBLIC_MAPBOX_TOKEN}`.
- `<Source type="geojson" cluster>` with `clusterMaxZoom={11}` and `clusterRadius={40}`.
- Cluster layer: circle with point count text.
- Unclustered layer: HTML markers with circular `<img>` avatars (40px) and a green border.
- Bottom sheet: `<BottomDrawer>` (existing component) with sortable list — by distance when GPS granted, alphabetical otherwise.
- "📍 Use my location" button — reuse the geolocation pattern from `RoundForm.tsx:206-230`. Lift `readGeoCache`/`writeGeoCache` into `src/lib/geo-cache.ts` so RoundForm and LoozerMap share one cache key.

**`src/components/LoozersList.tsx`** — extend the existing Grid|Tree toggle to Grid|Tree|Map. Persisted localStorage key already exists; just add the third value.

### Privacy

- City + state precision is the public bar — nothing finer than what users have already opted to display on their profile.
- Add a `users.show_on_map` boolean defaulting to `true` (with a checkbox in `ProfileEditor`) so anyone uncomfortable can opt out without blanking their city.
- The map is authenticated-only. Spectator gets nothing.

## Edge Cases

- A Loozer in a non-US city: `geocodeAddress` already accepts arbitrary strings; the existing `state` column is `varchar(2)` (US only). Out of scope here — they fall into the "no location set" footer chip.
- Two Loozers in the same city: clustering handles it down to building level — at max zoom they overlap. Acceptable; offset-spiral can be a follow-up.
- City + state set but Mapbox returns no result: lat/lng stay null, treated as "no location."
- Stale geocode after a user moves: covered by the `geocoded_at` mismatch check on save. No background refresh needed.

## Acceptance Criteria

1. `/loozers` shows a Grid | Tree | **Map** toggle; Map view renders all Loozers with city/state geocoded.
2. Editing a Loozer's city/state (self or admin) re-geocodes and the new pin appears on next page load.
3. The "📍 Use my location" button drops a "you" pin and sorts the bottom-sheet list by distance.
4. Loozers without city/state are excluded silently with a footer count.
5. `users.show_on_map = false` excludes that user.
6. Spectator page does NOT expose the map.
7. Map view choice persists across sessions (localStorage).

## Out of Scope

- Real-time location ("I'm here right now") — this is residence only.
- Cross-country travel itinerary sharing.
- International addresses (state column is US-only today).
- Round-played heatmap (separate idea — would use `courses` lat/lng, not user lat/lng).
