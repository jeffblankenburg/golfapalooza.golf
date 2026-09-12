Part of the v2 Courses feature. The `v2_course_holes` table already has
`overhead_image_url` / `green_image_url`, and the detail endpoint backfills them
from sibling tees — but there is **no upload path** in v2.

## Scope
- Port the original `/api/courses/holes/upload` to `/api/v2/courses/holes/upload` (v2 auth, universal edit) + a v2 storage bucket for course hole images.
- Add a "Photos" section to the v2 `CourseManager` (overhead + green image per hole).

## Acceptance
- A user can upload/replace/remove a hole's overhead + green images; they display in the manager and persist.

_Deferred during the initial Courses port._
