## Overview

`/courses/[id]` today opens straight into the `CourseManager` editor: hole rows with par/HCP/yards inputs, tee picker, GPS edit chrome. Great for editing, intimidating for browsing. Users have asked to "click through and review a course visually" — that's a read-only mode the page doesn't have right now.

## What we want

A clean read-only "visual review" that lives at `/courses/[id]` by default, with an explicit gesture to switch into edit mode. The review is the front door; editing is one click away for anyone with edit access.

### Review view contents
- Course header (already present): name, club, location, mapped-status badge, last-edited attribution.
- Tee selector chip row (same picker as edit mode), but selecting a tee swaps the readout, not an editor.
- Hole-by-hole gallery:
  - For each hole: hole number, name (if set), par, handicap index, yards (for the selected tee).
  - Hero image: the overhead map image when uploaded, otherwise the rendered `HoleMapEditor`-style map (read-only Mapbox tile + the 5 GPS points marked, plus the center_line if present). Falls back to a placeholder when nothing is mapped.
  - Green-detail image when uploaded, below the overhead.
- Course totals row: par total, yards total, slope/rating for the selected tee.
- Optional: rounds-played-here stat ("12 Loozer rounds, last played May 14 2026") sourced from the existing `last_played_at` + counts.

### Mode switching
- Default landing on `/courses/[id]` = review.
- For users with edit access (any signed-in Loozer on unlocked courses; admins on any), show an **"Edit course"** button at the top (probably inline with the lock badge).
- Clicking it switches to the existing `CourseManager` UI in-place (no navigation). Likely state: `view: "review" | "edit"`.
- Alternatively keep one URL but use `?mode=edit` so deep links land where intended. Pick whichever is simpler given the existing routing.
- Locked courses: edit button hidden for non-admins (`checkCourseEditAccess` already encodes this; reuse the `is_admin` flag from `/api/courses/[id]`).

## Implementation notes

- `CourseManager` already accepts `mode` (`"admin"` | `"loozer"`) and `viewerIsAdmin` — extend with `view: "review" | "edit"` (default `"review"`) or split the review path into its own component.
- The `HoleMapEditor` is interactive (drag-to-place points). For review, render the same Mapbox base with markers but without the controls — easiest is a "readOnly" prop, or a separate `HoleMapDisplay` that shares the marker logic from `src/lib/courses/mapped-status.ts`.
- Don't fetch any new endpoints; `/api/courses/[id]` already returns everything we need (tees, holes, coords, images, `is_admin`).
- Be careful about the green/center-line overlays: those propagate across tees per CLAUDE.md, so a tee switch doesn't refetch — pure display swap.

## Edge cases

- Course with no mapped data at all → review shows hole rows + scorecard data only; no map area, no "mapped 0/18" placeholder card. Gentle nudge: "No map data yet — click Edit to add."
- Course with 1 tee mapped but others empty → review shows the selected tee's data; tee switcher visibly indicates which tees lack data (re-use the per-tee mapped-status from `summarizeCourse`).
- Composition tees → hide the holes section (existing `selectedTeeIsComposition` gating still applies).
- Auto-save (just shipped) only matters in edit mode; not loaded in review.

## Acceptance criteria

1. `/courses/[id]` defaults to a read-only review with hero hole images + map + scorecard data.
2. Tee chips switch the displayed data without leaving the page.
3. Loozers with edit access see an "Edit course" button; clicking it swaps to the current editor.
4. Locked courses hide the edit button for non-admins; admin bypass works.
5. Course with no data displays cleanly without broken images or empty placeholder cards.
6. No regression in `/admin/courses` (which mounts `CourseManager` directly in `mode="admin"`, view should default to edit there).
7. Mapped-status badge in the page header still updates after edits (the `onCourseChanged` plumbing should fire identically).

## Out of scope

- Per-hole strategy notes / "best line" overlay drawings (could be a follow-up).
- Photo gallery beyond the existing overhead + green images.
- Comments/ratings.
