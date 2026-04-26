## Overview

Public-facing destination at `/hall-of-fame` for browsing 28+ years of Golfapalooza history. The Wall of Champions is the marquee surface — one big chronological table of every award winner since 1997 — backed by All-Time Leaderboards that surface the wow-factor numbers (career MVL count, lowest scramble round ever, most holed-from-outside-flagstick shots, etc.).

This is the *consumer* of the historical data ingested in [#114](../../issues/114). HOF cannot be built until #114 is at least at Phase 1 (data + reconciliation + storage tables). The Lifetime Stats tab on profile pages — also defined in #114 — is the personalized counterpart to this aggregate page.

**Public visibility**: yes, this is the marketing material for prospective Loozers. Available on `/spectator` views without auth.

## Phased rollout

### Phase 1 — Wall of Champions + All-Time Leaderboards (the v1 ship)

This is the highest information density per LOC and works directly off the aggregate tables populated by #114.

**Wall of Champions** — one chronological table at the top of `/hall-of-fame`:
```
Year  Gen      MVL              ROY               Green Jacket    BSPITW    MELC      Singles    Doubles
2024  GXXVIII  Daniel Buckey    Jason Shields     Daniel Buckey   Jeff B    -         Jason S    Jason S + Chris M
2023  GXXVII   Jeff Blankenburg Kyle Bender       Mark K          Adam C    -         JT Thomas  Eric K + Daniel B
2022  GXXVI    Brian Flanagan   Jeffery Yost Jr   Chris M         Mark M    -         Eric K     Eric K + Daniel B
…
1997  GI       Rob Magruder     Bill Kolibash     -               -         -         -          -
```

- Empty cells where an award didn't exist that year (MELC starts in 2001, BSPITW starts in 2015, cornhole starts in 2005, etc.) — render with `—`, not blank.
- Each name is a link to that Loozer's profile (`/loozers/[id]` if reconciled to a real user, otherwise a non-link styled name).
- Generation column shows Roman numeral + year. Year is sticky on scroll for navigation.
- Sort: newest year first by default. No filter/search in v1 — the table is small enough to scan.
- Mobile: collapse to one card per year with awards stacked vertically.

**All-Time Leaderboards** — a grid of stat cards below the Wall:

| Card | Source | Example |
|---|---|---|
| Most MVLs | Sum of MVL wins per Loozer | "Brian F · Jeff B · JT Thomas (tied at 2)" |
| Most Trips Attended | `historical_attendance` count | "Brian F + Eric K — 30 each" |
| Lowest Individual Round | Min of `historical_rounds.gross_total` where format=individual | "Eric K — 78 in 2009" |
| Lowest Scramble Team Round | Min team gross | "Team 9 — 59 in 2025" |
| Most Holed-From-Outside | Sum across all scramble rounds | "Mark K — 19" |
| Most Par-3 in Regulation | Sum across all scramble rounds | "Brent K — 13" |
| Career Scoring Average | Avg of indv round totals (min 5 rounds) | "Jeff B — 84.84 (25 rounds)" |
| Most Awards | Sum of all award wins | "JT Thomas — 17" |
| Most Cornhole Wins | Singles + doubles | "JT Thomas — 11" |

Each card shows leader name + value + small subtitle (year/round count). Click → leader's profile.

### Phase 2 — Generation Browser (`/hall-of-fame/[year]`)

Per-year deep dive. One page per trip.

- **Banner**: Year + Roman numeral generation + attendee count + course (if known — see #114 Q2 about per-year course mapping).
- **Award winners section**: card grid with avatar (when reconciled to a real user) + award name + Loozer name. One card per award won.
- **Roster**: every Loozer who attended that year. Avatar + name + lifetime-attendance number ("21st trip").
- **Round results**: per round (Round 1, Round 2, Round 3 if applicable), table of every Loozer's score, sorted ascending. Show both individual scoring rounds and scramble rounds.
- **Trip superlatives** (auto-derived): best individual round of the trip, best scramble round, most birdies, most pars in a row, etc.
- **Course context**: if the trip's course is known, link to it.

Navigation: prev/next year arrows. List view at `/hall-of-fame/years` showing all years as a chronological card grid (year + Roman numeral + champion's name + attendee count).

### Phase 3 — Stretch surfaces

These are separate issues if appetite confirmed; defer until v1 + Generation Browser have proven the format.

- **Hole Difficulty** at `/hall-of-fame/holes` — uses `Indv Hole Difficulty` data. Heatmap-ranked list of holes (1–18) by avg-to-par across 28 years, with year-over-year trend if a hole's difficulty changed (signals a course renovation or weather year).
- **Head-to-Head Rivalries** at `/hall-of-fame/vs/[id1]/[id2]` — pick two Loozers, see lifetime record: rounds played together, head-to-head wins (lower score = win), avg margin, biggest blowout, longest losing streak. Targeted nostalgia bait for the chat-callout crowd.
- **"Career arc" charts** on Loozer profiles — line chart of avg score per year. Shows improvement over time, the bad year, etc.
- **Auto-generated yearly recap article** — ties into [#109](../../issues/109)'s AI features. Generate a draft article from the Generation Browser data, admin polishes and publishes.

## Technical implementation

### Data dependencies (must exist from #114)

- `historical_trips` — year, generation_name, attendee_count, course_id
- `historical_loozers` — workbook_name, user_id (when reconciled)
- `historical_attendance` — trip_id × loozer_id
- `historical_rounds` — trip_id, loozer_id, round_number, format, total
- `historical_round_holes` — round_id, hole_number, par, gross_score, to_par
- `historical_awards` — trip_id, award_type, loozer_id, team_partner_id

If any of these don't exist when this issue is picked up, work blocks on #114.

### New API endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/hall-of-fame/champions` | Wall of Champions data — one row per year with all award winners (joined to `users` for avatar/display_name when reconciled) |
| GET | `/api/hall-of-fame/leaderboards` | All-Time Leaderboards — server-computed aggregates returned as a single payload (cached) |
| GET | `/api/hall-of-fame/years/[year]` | Generation Browser data — attendees, awards, rounds, superlatives for one year |

All endpoints are public-read (no auth). Use the existing `createAdminClient` server-side to bypass RLS, since `historical_*` tables are public-readable per the RLS policy in #114.

### Caching

The Wall of Champions and Leaderboards change at most once a year (after a trip completes). Cache the responses for an hour with `revalidate = 3600`. The Generation Browser per-year payloads can cache for a day. No need for a CDN tier — Next.js's static cache is enough.

### File structure

```
src/app/(public)/hall-of-fame/
  page.tsx                      # Wall of Champions + Leaderboards (Phase 1)
  [year]/page.tsx               # Generation Browser (Phase 2)
  years/page.tsx                # Year index card grid (Phase 2)
  holes/page.tsx                # Hole difficulty heatmap (Phase 3)
  vs/[id1]/[id2]/page.tsx       # Head-to-head (Phase 3)

src/components/hall-of-fame/
  WallOfChampions.tsx
  AllTimeLeaderboards.tsx
  GenerationBanner.tsx          # Phase 2
  GenerationRoster.tsx          # Phase 2
  GenerationRounds.tsx          # Phase 2

src/app/api/hall-of-fame/
  champions/route.ts
  leaderboards/route.ts
  years/[year]/route.ts         # Phase 2
```

### Linking to live profiles

When a `historical_loozers` row has a non-null `user_id`, render the name as a link to `/loozers/[user_id]`. When `user_id` is null (historical-only Loozer who never had an app account), render plain text styled the same way for visual consistency. Don't link to a 404.

### Spectator visibility

Per the spectator pattern in CLAUDE.md, anything publicly viewable in the authenticated section should also be reachable from `/spectator/*`. For HOF this is trivial because the data is already public (no auth checks in the API endpoints), so we just add `/spectator/hall-of-fame` as an alias route that renders the same components.

## Edge cases

- **Loozer with two-name change** (married, etc.) — workbook may have two `historical_loozers` rows that should both link to the same `users.id`. Reconciliation in #114 handles the linking; this page just renders whatever it finds.
- **Award given but team_partner_id is null** for a doubles cornhole row — show the primary winner only with `(partner unknown)` muted text.
- **Year has zero awards** (e.g., 2020 COVID gap) — still show the row with all `—`s. Don't skip it; the empty year is part of the story.
- **Reconciliation hasn't happened yet** — render names as plain text everywhere, no broken links.
- **Two Loozers tied for a leaderboard** — show all tied names, separated by `·`. If more than 4 tied, show top 3 + "and N more."

## Acceptance criteria — Phase 1

- [ ] `/hall-of-fame` renders the Wall of Champions table with every year 1997–present
- [ ] Empty award cells render as `—`, not blank
- [ ] Each Loozer name links to `/loozers/[id]` when reconciled, plain text when not
- [ ] All-Time Leaderboards grid shows the 9 cards listed above with correct values
- [ ] Page is publicly accessible (no auth)
- [ ] Page is also available at `/spectator/hall-of-fame`
- [ ] Mobile layout collapses table to one card per year
- [ ] Numbers reconcile to the Summary sheet aggregates from the source spreadsheet

## Acceptance criteria — Phase 2

- [ ] `/hall-of-fame/[year]` renders for every year that exists in `historical_trips`
- [ ] Banner shows year, Roman numeral, attendee count, course (if mapped)
- [ ] Award winners section shows one card per award won that year, with avatar when reconciled
- [ ] Roster lists every attendee
- [ ] Round results table shows all rounds (individual + scramble) sorted by score ascending
- [ ] Prev / next year arrows wired
- [ ] `/hall-of-fame/years` index renders a chronological card grid

## Open questions for whoever picks this up

- **Per-year course mapping** — at issue time of writing, #114 left this as an admin-input step. The Generation Browser will need that data to render the "Played at:" line. If the admin tool isn't built yet, render "Course unknown" until it is.
- **Color treatment for awards** — should each award type have its own color/icon (gold MVL, green Green Jacket, etc.)? Lean: yes for the Generation Browser cards, no for the Wall of Champions table (would be too noisy).
- **What's the "Last 5 years only" / "All time" toggle on leaderboards?** v1 says all-time only. Add a toggle in v2 if requested.
- **Generation Browser: should incomplete/historical-only Loozers (no app account) get a stub profile page?** Lean: no — render their name as plain text everywhere, and accept that some history rows are read-only.

## Files this issue creates or touches

- `src/app/(public)/hall-of-fame/page.tsx` (new — Phase 1)
- `src/app/(public)/hall-of-fame/[year]/page.tsx` (new — Phase 2)
- `src/app/(public)/hall-of-fame/years/page.tsx` (new — Phase 2)
- `src/app/(public)/spectator/hall-of-fame/page.tsx` (new — public alias)
- `src/components/hall-of-fame/WallOfChampions.tsx` (new)
- `src/components/hall-of-fame/AllTimeLeaderboards.tsx` (new)
- `src/components/hall-of-fame/Generation*.tsx` (new — Phase 2)
- `src/app/api/hall-of-fame/champions/route.ts` (new)
- `src/app/api/hall-of-fame/leaderboards/route.ts` (new)
- `src/app/api/hall-of-fame/years/[year]/route.ts` (new — Phase 2)
- Main nav (modified) — add link to Hall of Fame
- `CLAUDE.md` (modified — new endpoints + page)

## Related

- [#114](../../issues/114) — Historical data import (the data foundation; HOF cannot ship without it)
- [#109](../../issues/109) — AI-assisted data entry (auto-generated recap articles in Phase 3)
- [#110](../../issues/110) — AI scorecard lookup (the per-year course mapping work touches the same `courses` table)
