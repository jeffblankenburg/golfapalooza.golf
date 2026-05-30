## Overview

A submit-and-vote feature for Golfapalooza **memories** / stories, mirroring the Best Line shape but with two key twists:

1. **Top-5-from-each-Loozer aggregation**: every Loozer picks their personal top 5 memories. The global "Top 10 Memories" is computed from aggregated picks (Eurovision-style point distribution: 5 pts for #1, 4 for #2 … 1 for #5).
2. **Year / event tags**: each memory is tied to a trip year (and optionally a specific event/contest within that trip). This lets the same data also render as a chronological **history timeline** — scroll back through 28+ years of Golfapalooza.

Pairs naturally with the historical import work (issue #114) once Phase 1b ships — submitted memories can hook into existing trip years.

## User experience

### Submitting a memory
- Any signed-in Loozer can submit. Form: `text` (multi-line, max ~500 chars), `trip_id` picker (sourced from `trip_settings`), optional `event_label` free-text (e.g. "Saturday night fire pit", "KGB Cup 2018 final hole").
- Optional: attach a photo (Supabase Storage bucket, public read) — single image, like chat-images. Defer to Phase 2 if it stretches the issue.
- Edit/delete own submission while voting hasn't opened. Once voting opens, submissions lock.

### Voting (Top 5)
- Each Loozer picks their personal **top 5** out of all submitted memories, ranked 1–5.
- UI: pickable list with drag-to-reorder, or 5 dropdowns ("Your #1: ___", "Your #2: ___"). Pick the simpler implementation.
- Submitting a vote is one transactional save: the user's full top-5 in one POST.
- One ballot per Loozer; editing replaces.

### Global leaderboard
- Borda count: `points = (6 - rank)` per ballot rank (rank 1 → 5 pts, rank 5 → 1 pt). Tie-break: most #1s, then most #2s, etc., then earliest submission.
- "Top 10 Memories" page shows ranked list. Each row: rank, memory text, submitter avatar/name, year/event tags, point total + how many Loozers ranked it.
- Anonymity flag (per-poll style — like `polls.is_anonymous`): the SUBMITTER name can be public always; individual votes never expose `user_id`.

### Timeline view
- Same data, different lens. Pickable by year or "All". For each year, list memories chronologically with their submitter + tag.
- Filter chip for trip year, optional event filter.
- Memories that ended up in the Top 10 get a small "★ Top 10" badge inline.

## Schema sketch

- `memories(id, submitter_id, trip_id, event_label TEXT, body TEXT, image_url TEXT, status TEXT)` — `status` ∈ ('submitting','voting','closed') trip-level lifecycle, or move to admin-controlled phase like polls.
- `memory_votes(id, voter_id, memory_id, rank SMALLINT)` — `(voter_id, memory_id)` unique; `(voter_id, rank)` unique (each voter has one rank-1, one rank-2, etc.).
- Reuse the audience/lifecycle model from polls (issue: only one "voting" cycle active at a time? Or perpetual?).

## Open questions

- **Cadence**: is this an annual cycle (open submissions each spring → vote in summer → reveal at trip → close) or always-on (any year, vote whenever)?
- **Voting denominator**: must a Loozer submit a memory to vote? (Yes for fairness, no for participation.)
- **Photo support**: in v1 or v2?
- **Permission gate**: admin-controlled lifecycle like polls, or any-Loozer-can-submit-anytime?

## Acceptance criteria

1. Loozer can submit a memory with year + optional event tag (+ optional photo if v1 scope).
2. Loozer can submit a top-5 ballot; editing replaces.
3. Public Top 10 page renders by Borda points with tie-break rules.
4. Timeline view filters by year, defaults to "All".
5. Anonymous voting honored: individual votes never expose `user_id`; only aggregates.
6. Spectator/public view: timeline yes, voting no (consistent with polls).
7. README updated.

## Reference patterns

- Submission flow: `BestLineContent.tsx` + `/api/best-lines/route.ts`.
- Lifecycle + anonymity: `polls` (migration `00114`, audience helpers in `src/lib/audience.ts`).
- Year tags use `trip_settings` (already populated 1997–2024 by `seed-historical-trips.mjs`).
