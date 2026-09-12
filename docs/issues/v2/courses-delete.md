The v2 `CourseManager` can delete tees but not a whole course. Since courses are
universal (shared by every group), deletion needs a guard/confirm.

## Scope
- `DELETE /api/v2/courses/[id]` (cascades tees/holes/mappings).
- A confirm-gated "Delete course" action in `CourseManager`.
- Decide the guard: any user vs a soft "are you sure this isn't used elsewhere" (courses are shared).

## Acceptance
- A course can be deleted with confirmation; tees/holes/composition mappings cascade.

_Deferred during the initial Courses port._
