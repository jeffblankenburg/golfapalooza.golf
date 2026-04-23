## Overview

The photo gallery today supports filtering by photographer and year. Users also want to filter by **person appearing in the photo** — i.e., by tagged Loozer. Tag data already exists on uploads; this issue is about exposing a filter.

## User Experience

1. On the gallery landing page, a new filter chip/dropdown: "Person"
2. Selecting a Loozer filters to photos/videos where that person is tagged
3. Works in combination with existing filters (photographer, year) — AND semantics
4. Clear/reset button returns to unfiltered view
5. Avatar or small name chip shows the active "Person" filter
6. Deep-link-able: `?taggedUser={id}` in URL so it can be shared

### Edge cases

- Loozer is tagged in zero media → show empty state with "Clear filter" CTA
- Multiple people tagged in a photo → photo appears under every tagged Loozer's filter

## Technical Notes

- Tag data lives in an existing `gallery_media_tags` table (or similar)
- Filter is a query param + server-side filter join against tags table
- Make sure tagged-in filter respects visibility rules (hidden/reported media still hidden)

## Acceptance Criteria

- [ ] Person filter available on gallery landing
- [ ] Combines with photographer + year filters
- [ ] URL-shareable filter state
- [ ] Empty state when no tagged media
- [ ] No performance regression with large galleries (query uses indexed join)
