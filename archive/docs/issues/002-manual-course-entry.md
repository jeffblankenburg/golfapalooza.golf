# Issue: Allow Manual Course Entry

## Priority: Future Feature

## Problem Statement

Not all golf courses are available in the GolfCourseAPI database. Users should be able to manually add courses that don't exist in the system, ensuring they can track scores at any course they play.

## Use Cases

1. **Small/Private Courses** - Local 9-hole courses or private clubs not in API
2. **New Courses** - Recently opened courses not yet indexed
3. **International Courses** - Courses outside API coverage areas
4. **Temporary Courses** - Pop-up or charity tournament courses

## Proposed Solution

### Manual Course Entry Form

Fields:
- Course name (required)
- Club name (optional)
- City, State, Country (required)
- Number of holes: 9 or 18 (required)
- Website (optional)
- Phone (optional)

### Manual Tee Entry

For each tee box:
- Tee name (e.g., "Blue", "White")
- Course rating (required for handicap calc)
- Slope rating (required for handicap calc)
- Par (required)
- Total yardage (optional)

### Manual Hole Entry (Optional)

For each hole:
- Par (3, 4, or 5)
- Handicap index (1-18)
- Yardage (optional)

## Data Model Changes

```sql
ALTER TABLE courses ADD COLUMN
  is_user_created BOOLEAN DEFAULT FALSE,
  created_by_user_id UUID REFERENCES users(id);
```

## Validation Rules

- User-created courses are private by default
- Admin can approve to make public
- Must have at least one tee with rating/slope for handicap tracking
- Cannot have same name + city as existing course

## UI/UX

- "Can't find your course?" link in search results
- Multi-step wizard similar to new round flow
- Option to submit for API inclusion (future)

## Out of Scope

- Bulk import from spreadsheet
- Course editing by non-creator
- Photo upload for course

## Acceptance Criteria

- [ ] User can create a course with basic info
- [ ] User can add tee boxes with ratings
- [ ] User can optionally add hole-by-hole data
- [ ] User-created courses appear in their search results
- [ ] Handicap calculations work with user-created courses
- [ ] Admin can view/approve user-created courses

---

## Dependencies

- Requires Issue #001 (Course Caching Strategy) to be complete
- User authentication required
