# Feature: Loozer-Editable Courses

## Overview

Today, the home page has a single "Course" quick link that opens the active event's course (Alpine Lake). Course editing — including the satellite map editor with five GPS points per hole — is locked behind the admin tools.

This issue:
1. Replaces the home-page "Course" link with a **"Courses"** entry point that lists every course in the system.
2. Lifts the existing admin map editor and per-hole data editor into a Loozer-facing surface, so any authenticated Loozer can contribute mapping data and hole metadata to **unlocked** courses.
3. Adds clear "mapped" status indicators per hole / per tee / per course so contributors know where to focus.
4. Adds an "Add new course" CTA on the list page that reuses the existing DB → GCAPI → AI lookup cascade.

The schema work is already done — `courses.locked` (from migration `00079_course_locking.sql`) plus the existing RLS policies already gate non-admin writes correctly. This issue is almost entirely UI + a new public-facing route surface.

## User Experience

### Home page

The "Course" tile becomes **"Courses"** and links to `/courses`. The icon stays the same (golf flag).

`/course` (singular) redirects to `/courses` so any old shared links still work.

### `/courses` list page (auth-only)

Three sections, top-to-bottom:

1. **Active event course** — large featured card pinned at the top. Same prominent CTA the old `/course` button used to land you on, just folded into the new list.
2. **"+ Add new course" button** — opens the existing `CourseLookupModal` (the DB → GCAPI → AI cascade from round creation). On success, the new course appears in the list below.
3. **All courses** — scrollable list, searchable by name / city / state. Sort: last-played desc, then alpha by name.

**Per-row indicators on each course:**
- 🔒 **Locked** badge (admin-only edits)
- **Mapped status**: `12/18 holes` if fully-mapped count < total, or `✓ Fully mapped` if 18/18. Hidden if there are no tees / no holes yet.
- City, state in muted text.

### `/courses/[id]` detail page (auth-only)

Reuses the existing `CourseManager` component, but with a few adaptations:

**Header**
- Course name + city/state.
- "Last edited by [Name] on [Date]" (new — see Data Model below).
- 🔒 Lock indicator if `locked`. Admin-only **Lock/Unlock** toggle.
- Admin-only **Delete** button (cascades, 409 if any rounds reference it).
- **"How to edit"** link — opens the help drawer (always available, not one-time).

**Body** — three collapsible sections:
1. **Course info** — name, club, city, state, address, phone, website. Editable when `!locked || isAdmin`.
2. **Tees** — list of tee boxes with rating/slope/par. Per-tee mapped-progress badge: `15/18 holes mapped`. Edit/Add/Delete tee actions when editable.
3. **Holes** — per-hole rows with par / yardage / handicap_index. Each row shows:
   - Mapped status: ✅ all five set, OR ⚠️ "Missing: tee, drive" (specific list of what's missing).
   - **Edit data** action — inline form for par/yards/HI.
   - **Edit map** action — opens the `HoleMapEditor` modal.

Edit affordances are hidden (not just disabled) when the course is `locked` and the viewer isn't an admin.

### `HoleMapEditor` (lifted from admin)

The existing component ships almost unchanged — same satellite map, same five-point buttons, same Mapbox interaction. The additions:

- **Help drawer access**: a small `?` icon top-right opens an inline drawer with step-by-step instructions and a labeled diagram (what each point is, how to place / clear, what the corridor polyline does). Always available, not first-time-only.
- **Ideal-drive fallback**: when no `drive_latitude`/`drive_longitude` is set, render a **ghost marker** at 250 yards from the current tee toward the green center. The user can drag-confirm the ghost into a real drive point, or place a new one to override. Once saved, it's the shared drive for all tees on this hole (existing storage behavior).
- **Inline microcopy** under each point button explaining what it represents (e.g., "Tee box: where you tee off from this hole on these tees").

No mobile redesign in v1. The editor remains functional but cramped on small screens; we'll iterate based on real-world Loozer feedback.

### Help drawer copy (`How to edit`)

A persistent right-side drawer accessible from the editor header (and from the course detail page header). Sections:
- **The five points** — what each is, why it matters (e.g., "Green back lets the app calculate green depth for layup decisions")
- **Mapping a hole step-by-step** — tap the button, tap the map
- **Ideal drive** — what 250yd default means; how to override
- **Locked courses** — explanation of why some courses can't be edited (events, etc.)
- **What happens to my old scorecards?** — *"Edits don't change scorecards already saved. Your rounds keep the par, yardage, and handicap they had on the day."*

### "Add new course" flow

Single button at the top of the list (under the active-event card). Tapping it opens the existing `CourseLookupModal` — same UX as the round-creation cascade. After commit, the modal closes and the list reloads with the new course in place.

## Scorecard Immutability

Important user-visible promise: **editing a course never changes existing scorecards.**

Today, this is *almost* true:
- `round_players.score_differential` and `final_adjusted_score` are **snapshotted at completion** — those numbers don't drift.
- BUT the round detail page renders per-hole "score vs par" labels (birdie circle, bogey square, etc.) by deriving against current `course_holes.par`. If a Loozer corrects hole 7 par from 4 to 5, every historical scorecard that shows "+1 on hole 7" would flip to "even on hole 7."

For v1: **document this as a known caveat in the help drawer** and ship. Snapshotting per-hole par/yards/HI into `round_scores` would be a meaningful migration + recompute; if it matters, we do it as a follow-up. The stored handicap math doesn't drift — only the visual labels do.

## Data Model

### Migration `00157_course_edit_attribution.sql`

```sql
ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Stamp on every write via existing edit endpoints (server-side, not a trigger
-- — keeps the responsibility explicit and avoids drift between code paths).
```

`course_tees.updated_at`/`updated_by` and `course_holes.updated_at`/`updated_by` *could* be added too, but for v1 we just attribute at the course level. A more granular audit log is a follow-up if needed.

### No other schema changes

- `locked` already exists.
- RLS already gates non-admin writes correctly.
- GPS storage works as-is.

## Surface Area

### New files

- `src/app/(app)/courses/page.tsx` — list page
- `src/app/(app)/courses/[id]/page.tsx` — detail/edit page
- `src/app/(app)/course/page.tsx` — redirect to `/courses` (or update if it currently exists)
- `src/components/courses/CourseDetail.tsx` — wraps `CourseManager` with Loozer-context permissions
- `src/components/courses/CourseHelpDrawer.tsx` — persistent help drawer
- `src/components/courses/MappedStatusBadge.tsx` — small reusable badge
- `src/lib/courses/mapped-status.ts` — pure helper that takes a course-with-tees-and-holes and returns `{ totalPoints, setPoints, missingByHole, fullyMappedHoleCount, totalHoles }`

### Modified files

- `src/components/HomeContent.tsx` — change `Course` → `Courses`, target `/courses`
- `src/components/admin/CourseManager.tsx` — accept a `mode: "admin" | "loozer"` prop (or accept `canLock`, `canDelete`, `isLocked` directly) so the same component drives both contexts
- `src/components/admin/HoleMapEditor.tsx` — add the help drawer trigger, ideal-drive ghost marker, per-button microcopy
- `src/components/my-rounds/CourseLookupModal.tsx` — already triggerable, just needs an entry point on `/courses`
- Existing admin edit endpoints (`/api/admin/course/holes`, `/api/admin/course/holes/coordinates`, `/api/admin/course/tees`) — these were admin-only; we either (a) widen their auth gate to "any authenticated user" (RLS will still enforce `locked`), or (b) create parallel `/api/courses/...` endpoints. **Recommendation: widen the existing endpoints and rename them under `/api/courses/...` to drop the `admin` prefix**, since RLS does the gating. Old admin pages will keep working unchanged.
- `CLAUDE.md` — document the new routes, the lock-gates-edit model, scorecard-immutability caveat
- `README.md` — note the new Courses page + Loozer mapping contribution

### Existing endpoints to repath / rewiden

| Old | New | Change |
|---|---|---|
| `PUT /api/admin/course/holes` | `PUT /api/courses/holes` | Auth: any signed-in user. RLS gates write. |
| `PUT /api/admin/course/holes/coordinates` | `PUT /api/courses/holes/coordinates` | Same. |
| `POST/PUT/DELETE /api/admin/course/tees` | `/api/courses/tees` | Same. |
| `POST /api/admin/courses/{id}/verify` | (keep on admin path) | This becomes admin-only lock toggle. |

Old admin paths stay as thin aliases for one release so any in-flight admin sessions don't break, then get removed.

## Out of Scope (Follow-ups)

- **Mobile map editor redesign** — lift as-is, polish later based on real-world use.
- **Delete suggestion / "PR"-style flow** — admins can still delete; suggestion workflow can come later if Loozers actually want it.
- **Per-tee / per-hole edit attribution** — only course-level attribution in v1.
- **Per-hole par/yards/HI snapshot into `round_scores`** — see Scorecard Immutability section. The display drift is documented in the help drawer; a real snapshot migration is its own issue if we decide to fix it.
- **Public spectator courses page** — staying auth-only per design call.
- **Activity feed** — no "X edited Y" notifications fan out from this. Could later be wired into the favorites system (issue not yet built) if there's appetite.

## Acceptance Criteria

- [ ] Home page shows "Courses" (not "Course"), links to `/courses`.
- [ ] `/courses` lists every course with featured event-course card on top, search, and per-row mapped/lock indicators.
- [ ] "+ Add new course" on `/courses` opens the lookup cascade and inserts on commit.
- [ ] `/courses/[id]` shows full detail; edit affordances appear when the course is unlocked OR viewer is admin.
- [ ] Map editor opens via the per-hole "Edit map" action, with help drawer and ideal-drive ghost marker.
- [ ] Locked courses are read-only for non-admins (UI hides edit buttons, API/RLS enforces).
- [ ] Admin can lock/unlock and delete a course from the detail page.
- [ ] `courses.updated_at` + `updated_by` stamp on every write; visible on detail page.
- [ ] Existing admin tools at `/admin/courses` continue to work unchanged.
- [ ] CLAUDE.md + README updated.

## Verification Checklist

1. **Home button:** Home page shows "Courses" tile. Tap → lands on `/courses`. Active-event card visible at top.
2. **Search:** Type "alpine" in the list search → list narrows to Alpine Lake. Clear → full list returns.
3. **Add course:** Tap "+ Add new course" → lookup cascade modal opens → search a new course → confirm → modal closes → new course appears in list.
4. **Open unlocked course:** Tap any unlocked course → detail page → edit buttons visible. Edit par on hole 5 → save → reload → new value persists.
5. **Open locked course:** Lock Alpine Lake as admin → log in as a non-admin Loozer → open Alpine Lake → no edit buttons visible. Locked icon shown. `PUT /api/courses/holes` returns 403 if hand-rolled.
6. **Mapped status accuracy:** Course with 14/18 fully-mapped holes shows `14/18 holes` on the list. A hole with green center missing shows "Missing: green center" in the row.
7. **Ideal-drive ghost:** Open map editor on a hole with no drive set. Confirm a faded ghost marker appears 250yd from the tee toward the green. Tap it → it becomes a real point. Save → reload → real drive point persists.
8. **Help drawer:** Tap the `?` icon → drawer opens with the five-points explanation. Closes cleanly. Reopen → works again (not one-time).
9. **Attribution:** Edit a course as Loozer A → reload → "Last edited by A on [today]" appears in the header.
10. **Admin lock toggle:** As admin, tap Lock → page re-renders without edit buttons (from admin's own view too) until Unlock is tapped.
11. **Delete (admin):** As admin, tap Delete on a course with no rounds → confirmation → course gone. As admin, try Delete on a course with rounds → 409 error surfaced.
12. **Scorecard immutability:** Open a completed round on Alpine Lake → note hole 7 displays "Birdie" against par 4. As admin, edit hole 7 par to 5 on the course → reopen the same round → the gross score, differential, and handicap are unchanged. (Note: the visual "Birdie" label *will* drift — this is the known caveat documented in the help drawer.)
13. **Mobile sanity:** Open `/courses` on a phone. List scrolls, search works, tapping a course opens the detail page. Open the map editor → it's usable but cramped (acceptable for v1).
14. **Round creation still works:** Start a new round → new-course lookup → confirm → round creates. Same flow as before, no regression.
15. **Migration applied:** `00157_course_edit_attribution.sql` runs cleanly; `courses.updated_at` + `updated_by` exist.
