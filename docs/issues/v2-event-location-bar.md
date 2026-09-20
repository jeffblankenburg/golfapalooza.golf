## Summary
Add an optional **location bar** on the event home page, directly under the date bar. Free text, set by an event administrator. If empty, the bar doesn't render.

## Current state
- The home page (`src/app/new/[slug]/(event)/page.tsx`) shows the event title (`.eventHero`) then a **date bar** (`.dateBand`, line ~70) with the date range + `Countdown`.
- `v2_events` has **no location column** (see `00179_v2_clean_foundation.sql`: name, year, start_date, end_date, status…).

## Scope
- **Schema**: add `v2_events.location TEXT` (nullable) via a new migration.
- **Admin**: a "Location" text input on the event editor (`/new/[slug]/admin/events/[eventId]`), saved to `v2_events.location`. Free text (e.g. "Thorn Apple Country Club, Grand Rapids, MI" or "Northern Michigan").
- **Home render**: below `.dateBand`, render a second bar (a `.locationBand` sibling) showing the location with a small pin icon. **Render nothing when `location` is null/empty** (like the date bar already conditionally renders).
- Select `location` in the event query on the home page (`page.tsx` currently selects `id, name, year, start_date, end_date, status`).

## Notes
- Purely additive + optional; no effect when unset.
- Spectator home (`SpectatorHomeContent`) should show it too if it renders event info (it's public, non-personalized — location is fine to expose). Verify per the spectator-parity rule in CLAUDE.md.
- Small styling task: match the date bar's treatment (`.dateBand` / `.dateText`).
