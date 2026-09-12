`GET /api/v2/courses` already supports `lat`/`lng`/`radius` (haversine), but the
v2 `CoursesList` UI only does text search.

## Scope
- Add a "near me" toggle to `CoursesList` (geolocation → radius query), matching the original's nearby behavior.

## Acceptance
- Users can find courses near their location, sorted by distance.

_Deferred during the initial Courses port._
