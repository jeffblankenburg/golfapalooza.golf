# v2: close "forced capability" leaks (make admin-configurable)

## Principle

The v2 platform is meant to be fully customizable per group-admin: capabilities should be **opt-in options an admin configures**, not always-on defaults. A few capabilities leaked in as forced defaults. This issue tracks closing them so none are silently dropped.

The infrastructure already exists — the fix is almost always **wiring an existing config surface to an admin toggle**, not new plumbing:
- Feature registry: `src/lib/v2/features.ts` (+ `v2_event_features` per-org/per-event rows)
- Per-org columns: `v2_organizations` (e.g. `member_noun`, `show_birthdays`, `store_enabled`, `name_display`)
- Per-contest config: `v2_contests.config` JSONB

## DONE (2026-10-02)

- [x] **Scramble scorer forced greens/putts.** The scramble scorer always showed per-player "Green" (`on_green`) + "Putt" (`holed_out`) toggles and wrote `v2_contest_observations` on every hole — and nothing even consumed them downstream yet. Now gated by `config.track_greens` / `config.track_putts`, **off by default**, set in Contest settings (scramble only). Scorer hides the toggles when off. Files: `ContestSettings.tsx`, `ScoringManager.tsx`, `scoring/page.tsx`, contest detail `page.tsx`.

## TODO (verified leaks)

- [ ] **Contest `auto_enroll` / `scoring_source` forced by type.** `defaultAutoEnroll()` / `defaultScoringSource()` in `src/lib/v2/contests.ts` hardcode behavior per type. The DB columns are per-contest configurable, but no creation/settings UI exposes them — admins can't make a scramble opt-in, or flip a contest between auto-scored and hand-adjudicated. Fix: surface both as toggles in the contest create/settings flow.
- [ ] **Managed chat channels always created, no opt-out.** `ensureAllMembersRoom()` / `ensureEventRoom()` (`src/lib/v2/chat/channels.ts`) auto-create with no way to decline. Fix: per-org (and/or per-event) toggle; skip creation when off.
- [ ] **Event-span calendar banner always rendered.** Every active event auto-adds an all-day banner entry in `src/lib/v2/schedule-feed.ts`. Fix: per-event (or per-org) toggle.
- [ ] **Side-game catalog is a closed list of 4** (skins/CTP/LD/LP in `SideGames.tsx`). Lower priority — it's a real list, just not extensible per group.

## Explicitly NOT doing (considered, rejected as non-issues)

- Individual-round stats (putts/fairways/GIR/penalties) are already configurable per-user via `v2_profiles.tracked_stats`. (Possible future: let admins standardize/restrict the set per group — but not a "forced" bug.)
- Hardcoded constants that aren't capabilities anyone toggles: max strokes (20), max putts/penalties (10), tee-color hex map, min score (1), contest status enum.

## Acceptance

- [ ] Each TODO capability is either admin-configurable or consciously documented as always-on.
- [ ] Defaults for newly-exposed toggles preserve sensible behavior (opt-in where the capability is niche).
