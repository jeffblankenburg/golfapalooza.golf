AI/GCAPI-imported v2 courses land with `verified=false` (same as the original),
but v2 has **no admin review UI** to clear them (the original had
`/admin/courses/unverified`).

## Scope
- A v2 admin screen listing unverified courses with a "verify" action (sets `verified=true`, `verified_by`, `verified_at`).
- Optionally surface a "community-submitted / unverified" badge on the course detail.

## Acceptance
- An admin can review and verify AI/GCAPI-imported courses.

_Deferred during the initial Courses port._
