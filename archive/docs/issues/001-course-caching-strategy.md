# Issue: Implement Robust Course Caching Strategy

## Problem Statement

Currently, when a user searches for a golf course, we make external API calls to GolfCourseAPI.com and cache the results. However, the current implementation has several limitations:

1. **Inefficient API Usage** - We may call the external API for courses we've already fetched
2. **Poor Search UX** - Users see either cached OR API results, not a unified view
3. **No Data Freshness Strategy** - Cached data can become stale (course ratings change, tees are added/removed)
4. **Rate Limit Risk** - Free tier allows only 300 requests/day with no usage tracking
5. **No Usage-Based Prioritization** - Frequently-played courses aren't prioritized for freshness

## Current State

### What Works
- Courses are cached in Supabase with `external_id` from the API
- `cached_at` timestamp tracks when data was fetched
- 30-day staleness threshold exists
- Tees and holes are cached alongside courses

### What's Missing
- No API usage tracking
- No unified search across cache + API
- No background refresh mechanism
- No prioritization based on user activity
- No offline support strategy

## Proposed Solution

### Phase 1: Unified Search Experience

**Goal:** Search returns combined results from cache and API in one seamless list.

```
User searches "pebble beach"
        ↓
┌─────────────────────────────────────────┐
│  1. Query local cache (instant)         │
│  2. Query external API (async)          │
│  3. Merge results, dedupe by external_id│
│  4. Return unified list                 │
└─────────────────────────────────────────┘
        ↓
Results shown with indicators:
  ✓ Pebble Beach Golf Links [cached]
  ✓ Pebble Creek GC [cached]
  ○ Pebble Brook Golf Club [from API]
```

**Implementation:**
- Search cache first, return immediately
- Simultaneously query API
- Merge results client-side or server-side
- Deduplicate by `external_id`
- Cache new API results in background

### Phase 2: Smart Caching

**Goal:** Cache courses intelligently based on usage and freshness.

#### 2a. Cache on Selection
When user selects a course (not just searches), ensure full data is cached:
- Course details
- All tee boxes with ratings
- Hole-by-hole data (par, handicap, yardage)

#### 2b. Freshness Tiers
| Tier | Condition | Refresh Strategy |
|------|-----------|------------------|
| Hot | Used in round within 7 days | Refresh if >7 days old |
| Warm | Used in round within 30 days | Refresh if >30 days old |
| Cold | Not used in 30+ days | Refresh only on search |
| Stale | Never used, >90 days old | Delete from cache |

#### 2c. Background Sync Job
- Runs daily (or on app open)
- Refreshes "Hot" courses first
- Respects API rate limits
- Tracks last sync time per course

### Phase 3: API Usage Management

**Goal:** Never exceed rate limits, track usage for optimization.

#### 3a. Usage Tracking Table
```sql
CREATE TABLE api_usage (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  endpoint VARCHAR(100),
  requests_count INTEGER DEFAULT 0,
  UNIQUE(date, endpoint)
);
```

#### 3b. Rate Limit Logic
```
Before API call:
  1. Check today's usage count
  2. If >= 250 (buffer of 50), skip API call
  3. Use cache-only mode
  4. Log warning for admin
```

#### 3c. Usage Dashboard (Admin)
- Show daily/weekly API usage
- Alert when approaching limits
- Show most-searched courses (optimization targets)

### Phase 4: Data Integrity

**Goal:** Keep cached data accurate and complete.

#### 4a. Completeness Tracking
Add fields to `courses` table:
```sql
has_tee_data BOOLEAN DEFAULT FALSE,
has_hole_data BOOLEAN DEFAULT FALSE,
data_quality_score INTEGER, -- 0-100
last_verified_at TIMESTAMPTZ
```

#### 4b. User-Reported Issues
- "Report incorrect data" button on course
- Flags course for priority refresh
- Admin can review and manually update

#### 4c. Conflict Resolution
- API is source of truth for: ratings, pars, yardages
- Local-only data: user notes, custom nicknames
- On conflict: API wins, preserve local-only fields

### Phase 5: Offline Support (Future)

**Goal:** Allow scoring even without internet.

- Cache played courses in IndexedDB
- Sync scores when back online
- Show "offline available" indicator on courses

---

## Database Changes

### New Table: `api_usage`
```sql
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  endpoint VARCHAR(100) NOT NULL,
  requests_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, endpoint)
);
```

### Alter Table: `courses`
```sql
ALTER TABLE courses ADD COLUMN IF NOT EXISTS
  is_closed BOOLEAN DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  last_played_at TIMESTAMPTZ,
  play_count INTEGER DEFAULT 0,
  has_complete_tee_data BOOLEAN DEFAULT FALSE,
  has_complete_hole_data BOOLEAN DEFAULT FALSE,
  data_quality_score INTEGER DEFAULT 0,
  last_api_sync_at TIMESTAMPTZ;

-- Index for filtering out closed courses in search (optional)
CREATE INDEX idx_courses_is_closed ON courses(is_closed) WHERE is_closed = FALSE;
```

**Note on Closed Courses:**
- Closed courses remain searchable (users may be looking for historical data)
- Search results show "[CLOSED]" indicator
- Cannot start new rounds at closed courses
- Historical rounds at closed courses remain intact

---

## API Changes

### GET /api/courses?q=search
**Current:** Returns cache OR API results
**New:** Returns merged results with source indicator

```typescript
interface CourseSearchResult {
  courses: Array<Course & {
    source: 'cache' | 'api';
    is_stale: boolean;
  }>;
  cache_count: number;
  api_count: number;
  api_available: boolean;
}
```

### POST /api/courses/[courseId]/refresh
**New endpoint:** Force refresh course from API
- Requires authentication
- Updates cache with fresh data
- Returns updated course

### GET /api/admin/api-usage
**New endpoint:** View API usage stats (admin only)

---

## Acceptance Criteria

### Phase 1: Unified Search
- [ ] Search shows cached courses immediately
- [ ] API results appear within 2 seconds (loading indicator)
- [ ] Duplicate courses (same external_id) are merged
- [ ] User can distinguish cached vs fresh results
- [ ] New API results are cached automatically

### Phase 2: Smart Caching
- [ ] Selecting a course caches complete data (tees + holes)
- [ ] Courses used in rounds are marked with `last_played_at`
- [ ] Stale courses (>90 days, never used) are cleaned up
- [ ] Background job refreshes hot courses daily

### Phase 3: API Management
- [ ] API calls are logged to `api_usage` table
- [ ] Calls are blocked when approaching daily limit
- [ ] Admin can view usage dashboard
- [ ] Warning shown when in "cache-only mode"

### Phase 4: Data Integrity
- [ ] Courses show data completeness indicator
- [ ] Users can report incorrect data
- [ ] API data overwrites cache (except local-only fields)

---

## Out of Scope (Future)

- Offline scoring mode
- Course photos/images
- User reviews/ratings
- Course condition reports
- GPS hole mapping

---

## Implementation Order

1. **Phase 1** - Unified Search (highest user impact)
2. **Phase 3** - API Usage Tracking (prevent outages)
3. **Phase 2** - Smart Caching (optimization)
4. **Phase 4** - Data Integrity (polish)

---

## Decisions

| Question | Decision |
|----------|----------|
| Manual course entry? | Yes, future feature. See Issue #002 |
| Fallback APIs? | Low priority. See Issue #003 |
| Course data scope? | **Global** - shared across all users |
| Closed courses? | Keep in database, mark as `is_closed = true`. Users should find what they're looking for. |

---

## Related Issues

- **Issue #002** - [Manual Course Entry](./002-manual-course-entry.md) (Future)
- **Issue #003** - [Fallback API Options](./003-fallback-api-options.md) (Low Priority)

---

## References

- GolfCourseAPI Docs: https://api.golfcourseapi.com/docs/api/
- Current implementation: `/src/lib/golf-course-api/`
- Database schema: `/supabase/migrations/00002_golf_scoring_schema.sql`
