# Feature: Favorite Courses

## Overview

Allow users to mark courses as favorites for quick access when starting a new round. Favorites appear prominently in the course selection flow, reducing friction for users who frequently play the same courses.

### Problem Statement

Users who regularly play at the same 2-3 courses must either:
- Wait for location detection (which may fail indoors or in parking lots)
- Search for the same course repeatedly

Favorites provide instant access to frequently played courses.

---

## User Experience Flow

### Course Selection (New Round)

When starting a new round, the course step should show (in order):

1. **Favorites** (if any) - "Your Favorites" section at top
2. **Nearby courses** (if location available) - "Nearby" section
3. **Search** - Always available as fallback

### Adding a Favorite

Option A: From course selection
- After selecting a course, show a heart icon to favorite it
- Or show "Add to Favorites" option in the course context header

Option B: From round history
- View a past round → option to favorite that course

Option C: From search results
- Heart icon on each search result to quick-favorite

### Removing a Favorite

- Tap heart icon again to unfavorite
- Or manage favorites from a settings/profile page

---

## Technical Implementation

### Phase 1: Database Schema

#### New Table: `user_favorite_courses`

```sql
CREATE TABLE user_favorite_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, course_id)
);

-- RLS policies
ALTER TABLE user_favorite_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorites"
  ON user_favorite_courses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own favorites"
  ON user_favorite_courses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own favorites"
  ON user_favorite_courses FOR DELETE
  USING (auth.uid() = user_id);
```

### Phase 2: API Endpoints

#### GET `/api/favorites`

Returns user's favorite courses.

```typescript
// Response
{
  favorites: Course[]
}
```

#### POST `/api/favorites`

Add a course to favorites.

```typescript
// Request
{ course_id: string }

// Response
{ success: true }
```

#### DELETE `/api/favorites?course_id={id}`

Remove a course from favorites.

```typescript
// Response
{ success: true }
```

### Phase 3: Frontend Components

#### 3.1 Update Course Selection Flow

Modify the course step to show favorites first:

```typescript
// In new round page
const [favorites, setFavorites] = useState<Course[]>([]);

useEffect(() => {
  fetch('/api/favorites')
    .then(res => res.json())
    .then(data => setFavorites(data.favorites));
}, []);

// Render order:
// 1. Favorites section (if any)
// 2. Location detection / nearby courses
// 3. Search
```

#### 3.2 FavoriteCourses Component

```typescript
interface FavoriteCoursesProps {
  courses: Course[];
  onSelect: (course: Course) => void;
  onRemoveFavorite: (courseId: string) => void;
}
```

#### 3.3 Favorite Toggle Button

A reusable heart icon button:

```typescript
interface FavoriteButtonProps {
  courseId: string;
  isFavorite: boolean;
  onToggle: (courseId: string, isFavorite: boolean) => void;
}
```

### Phase 4: Integration Points

1. **Course context header** - Add favorite toggle when course is selected
2. **Search results** - Add favorite toggle to each result
3. **Round history** - Option to favorite courses from past rounds

---

## UI Design

### Favorites Section (Course Selection)

```
┌─────────────────────────────────────────────────────┐
│ Your Favorites                                      │
├─────────────────────────────────────────────────────┤
│ ♥ Meadowbrook Country Club                     →   │
│   Columbus, OH                                      │
├─────────────────────────────────────────────────────┤
│ ♥ Scioto Country Club                          →   │
│   Columbus, OH                                      │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Nearby                                              │
│ ...                                                 │
└─────────────────────────────────────────────────────┘
```

### Favorite Toggle States

- Empty heart (○) = Not a favorite
- Filled heart (♥) = Is a favorite
- Animate on toggle for feedback

---

## Acceptance Criteria

- [ ] Users can add courses to favorites
- [ ] Users can remove courses from favorites
- [ ] Favorites appear at top of course selection
- [ ] Favorites persist across sessions
- [ ] Maximum of 10 favorites per user (prevents abuse)
- [ ] Favorite toggle has visual feedback (animation)
- [ ] Works offline for viewing (favorites cached locally)

---

## Future Enhancements

1. **Reorder favorites** - Drag to reorder priority
2. **Favorite from map** - Map view of favorites
3. **Share favorites** - Share course recommendations
4. **Smart suggestions** - Auto-suggest favoriting frequently played courses

---

## Implementation Order

1. Database migration for `user_favorite_courses` table
2. API endpoints (GET, POST, DELETE)
3. `FavoriteButton` component
4. `FavoriteCourses` component
5. Integrate into course selection flow
6. Add favorite toggle to course context header
7. Add favorite toggle to search results
