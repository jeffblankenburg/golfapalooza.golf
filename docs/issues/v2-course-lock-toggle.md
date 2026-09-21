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

## Related (already tracked, not this)
- Unverified-course admin review → #160.
- Hole photo uploads → #159.
- Delete a course → #161.

Part of the Schedule & Logistics epic (#171).
