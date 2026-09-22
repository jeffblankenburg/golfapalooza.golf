## Summary
v1 courses have a **lock** (`courses.locked`): admins can lock a course so
non-admin Loozers can no longer edit it (issue #133, Loozer-editable courses). The v2
course surface ships editing but **has no lock toggle**, so there's no way for an admin
to freeze a canonical/verified course against further edits.

## Scope
- Add the lock flag to the v2 courses schema (or confirm it's imported) and an
  admin-only toggle on the v2 course detail/manager.
- Gate v2 public course writes on `!locked` (mirror `checkCourseEditAccess` from v1's
  `src/lib/courses/edit-access.ts`).
- Non-admins see a locked course as read-only.

## Implementation (shipped)
- **Migration 00236** — `v2_courses.locked BOOLEAN NOT NULL DEFAULT false`.
- **`src/lib/v2/courses/edit-access.ts`** — `courseEditGate` / `courseEditGateByTee`. A
  locked course is editable only by `isAnyOrgAdmin` (the same bar as course delete, since
  courses are a universal cross-org library); unlocked stays universal-edit.
- **All course write endpoints gated**: `PUT /courses/[id]`, tees POST/PUT/DELETE,
  holes PUT, holes/coordinates PUT, composition-tees POST/DELETE → 403 when locked & not
  admin. New **`PATCH /courses/[id] { locked }`** (admin-only) toggles the lock; GET now
  returns the real `is_admin`.
- **`CourseManager`** — admin Lock/Unlock control in the Info tab; a locked course shows a
  top banner and renders every tab read-only (inputs disabled, Save/Add/Delete hidden) for
  non-admins. Hybrid-tee read-only notes were decoupled from the lock read-only state.

## Related (already tracked, not this)
- Unverified-course admin review (+ the v1 `verified` toggle) → #160.
- Hole photo uploads → #159.
- Delete a course → #161.

Part of the Schedule & Logistics epic (#171).
