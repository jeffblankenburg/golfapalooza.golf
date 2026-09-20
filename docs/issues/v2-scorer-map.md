## Summary
Port the v1 in-scorer **Map** feature to the v2 full-screen scorer (`/new/[slug]/rounds/[id]/score`). v1 had a "Map" pill in the scorer's nav row that opened `ScoringMapDrawer` — a Mapbox satellite view with per-hole GPS markers (tee, green, drive, center line, a 250-yd ideal-drive ghost) plus Map / Overhead / Green image toggles. The v2 scorer currently has no map (deferred).

## Background / current state
- The v2 scorer nav row is prev / hole-name / next — no Map button.
- The data model supports it: `v2_course_holes` already has `tee_latitude/longitude`, `green_latitude/longitude`, `green_front/back_*`, `drive_latitude/longitude`, `center_line`, `overhead_image_url`, `green_image_url`.
- **Coverage is sparse** — of ~7,000 v2 holes: ~505 have tee GPS, 1,728 green, 1,406 drive, 198 overhead images, 13 center lines. So the map only lights up on courses that have been mapped in the course editor; most show an empty map. Worth a "not mapped yet" empty state.

## Legacy references
- `src/components/scoring/ScoringMapDrawer.tsx` (~303 lines)
- `src/components/my-rounds/HoleMapView.tsx` (Mapbox WebGL view — dynamic import, `ssr:false`)
- `src/lib/utils/tee-colors.ts` (`TEE_HEX_COLORS`)
- Mapbox token: `NEXT_PUBLIC_MAPBOX_TOKEN`

## Scope
- Load per-hole GPS + image URLs into the scorer page (currently not selected).
- Add a "Map" control to the scorer nav; port `ScoringMapDrawer` re-skinned to the v2 design system (respect the `--nav-h` / `--mini-h` bottom chrome so the music mini-player stays visible).
- Map / Overhead / Green toggle; per-hole markers; keep the Mapbox context warm (mounted, hidden) like v1.
- Empty state for unmapped holes.

## Notes
- Needs visual verification against a mapped course (e.g. one with overhead images).
- Part of the My Rounds epic (#174).
