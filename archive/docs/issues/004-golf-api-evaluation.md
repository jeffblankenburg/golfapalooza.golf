# Issue: Golf Course API Evaluation and Migration Plan

## Priority: High

## Problem Statement

We discovered that **Wynn Golf Club** (a famous, high-end Las Vegas course) is missing from our current data provider (GolfCourseAPI.com). This is a significant data quality concern:

- Wynn Golf Club is listed in multiple other databases (BlueGolf, GolfPass, Hole19, PGA.org)
- If a well-known course on the Las Vegas Strip is missing, there are likely many other gaps
- GolfCourseAPI.com has no visible way to report missing courses or contact support
- No indication of when their data was last updated

This elevates the priority from Issue #003 (which was marked "Low") to **High**.

---

## Current Provider Analysis: GolfCourseAPI.com

### Pros
- Free tier: 300 requests/day
- Claims ~30,000 courses worldwide
- Includes tee data, ratings, hole info
- Simple API key authentication

### Cons (Critical Issues)
| Issue | Impact |
|-------|--------|
| Missing courses (e.g., Wynn Golf Club) | Users can't find their course |
| No contact/support information | Can't report issues |
| No data submission process | Can't add missing courses |
| No update changelog | Unknown data freshness |
| No SLA or uptime guarantee | Reliability unknown |
| Website appears minimally maintained | Long-term viability questionable |

---

## Alternative APIs Evaluated

### 1. RapidAPI Golf Course Finder (GolfAmbit)

| Attribute | Details |
|-----------|---------|
| **Courses** | 30,000+ clubs, 39,000+ courses |
| **Geo Search** | Yes, up to 50 miles radius |
| **Data Fields** | Name, address, membership type, holes |
| **Scorecard Data** | No (separate Golf Course Details endpoint) |

**Pricing:**
| Tier | Requests | Cost |
|------|----------|------|
| Basic | 250/month | Free |
| Pro | 5,000/month | $10/mo |
| Ultra | 25,000/month | $25/mo |
| Mega | 10,000/day | $50/mo |

**Verdict:** Good coverage, reasonable pricing, but limited data (no scorecards on basic tier).

---

### 2. RapidAPI Golf Course API (foshesco)

| Attribute | Details |
|-----------|---------|
| **Courses** | 18,000+ |
| **Geo Search** | No (name search only, returns up to 10) |
| **Data Fields** | Scorecards, tee boxes, coordinates, address, phone |
| **Scorecard Data** | Yes |

**Pricing:**
| Tier | Requests | Cost |
|------|----------|------|
| Basic | 50/day | Free |
| Pro | 10,000/day | $10/mo |
| Ultra | 30,000/day | $20/mo |
| Mega | 100,000/day | $50/mo |

**Verdict:** Has scorecards but smaller database, no geo search is a dealbreaker for location-based detection.

---

### 3. Golf-Course-Database.com

| Attribute | Details |
|-----------|---------|
| **Courses** | 39,000+ worldwide (20,744 US/Canada) |
| **Geo Search** | Yes |
| **Data Fields** | 108 fields per club, coordinates, scorecards (full version) |
| **Data Quality** | Claims "rigorous data quality" |

**Pricing:**
- $50 one-time setup fee
- Monthly subscription (price not disclosed)
- Contact: support@golf-course-database.com

**Verdict:** Most comprehensive data, but requires contacting for pricing. Good for long-term if we need premium data.

---

### 4. GolfAPI.io

| Attribute | Details |
|-----------|---------|
| **Courses** | 42,000+ in 100+ countries |
| **Data Fields** | Complete scorecards, pars, stroke indexes, tees, distances, slope/course ratings, coordinates |
| **Export** | REST API or CSV bulk export |

**Pricing:** Unknown (contact required: contact@golfapi.io)

**Status:** Website was unreachable during testing (connection refused) - **reliability concern**.

**Verdict:** Best data on paper, but site being down is a red flag.

---

## Comparison Matrix

| Provider | Courses | Geo Search | Scorecards | Free Tier | Reliability | Support |
|----------|---------|------------|------------|-----------|-------------|---------|
| GolfCourseAPI.com | 30K | Yes | Yes | 300/day | Unknown | None |
| RapidAPI Golf Course Finder | 39K | Yes (50mi) | Paid only | 250/mo | Good | RapidAPI |
| RapidAPI Golf Course API | 18K | No | Yes | 50/day | Good | RapidAPI |
| Golf-Course-Database.com | 39K | Yes | Yes (full) | No | Unknown | Email |
| GolfAPI.io | 42K | ? | Yes | ? | Poor (down) | Email |

---

## Recommendation

### Immediate Action: Hybrid Approach

1. **Keep GolfCourseAPI.com as primary** (it's free and working)
2. **Add RapidAPI Golf Course Finder as fallback** for geo searches
3. **Implement manual course entry** (Issue #002) for missing courses
4. **Build adapter pattern** to swap providers easily

### Implementation Plan

#### Phase 1: Add Fallback Provider (1-2 days)

```typescript
// src/lib/golf-course-api/providers/index.ts
interface GolfCourseProvider {
  name: string;
  searchByName(query: string): Promise<Course[]>;
  searchByLocation(lat: number, lng: number, radiusMiles: number): Promise<Course[]>;
  getCourseDetails(id: string): Promise<CourseDetails | null>;
  isConfigured(): boolean;
}

// Implement adapters for each provider
class GolfCourseAPIProvider implements GolfCourseProvider { }
class RapidAPIGolfCourseFinder implements GolfCourseProvider { }
```

#### Phase 2: Fallback Chain Logic

```typescript
// Try providers in order until one succeeds
async function searchCourses(query: string): Promise<Course[]> {
  for (const provider of enabledProviders) {
    try {
      const results = await provider.searchByName(query);
      if (results.length > 0) return results;
    } catch (error) {
      console.warn(`Provider ${provider.name} failed:`, error);
      continue;
    }
  }
  return [];
}
```

#### Phase 3: Manual Course Entry (Issue #002)

Allow users to add courses that aren't in any API:
- Store in `courses` table with `source = 'user'`
- Admin approval workflow (optional)
- Contribute back to community (optional)

---

## Environment Variables

```bash
# Current
GOLF_COURSE_API_KEY=xxx

# New (add as needed)
RAPIDAPI_KEY=xxx
GOLF_COURSE_DB_USERNAME=xxx
GOLF_COURSE_DB_PASSWORD=xxx
```

---

## Acceptance Criteria

- [ ] Create provider interface/adapter pattern
- [ ] Implement RapidAPI Golf Course Finder adapter
- [ ] Add fallback logic to `/api/courses` route
- [ ] Test that Wynn Golf Club can be found
- [ ] Update CLAUDE.md with new environment variables
- [ ] Document provider priority in code comments

---

## Future Considerations

1. **Data Reconciliation** - Same course from different providers may have different IDs
2. **Caching Strategy** - Cache results from paid APIs more aggressively
3. **Rate Limit Management** - Track usage across providers
4. **Bulk Import** - Consider Golf-Course-Database.com CSV for comprehensive seed data

---

## References

- [GolfCourseAPI.com](https://golfcourseapi.com) - Current provider
- [RapidAPI Golf Course Finder](https://rapidapi.com/golfambit-golfambit-default/api/golf-course-finder) - Recommended fallback
- [RapidAPI Golf Course API](https://rapidapi.com/foshesco-65zCww9c1y0/api/golf-course-api) - Alternative
- [Golf-Course-Database.com](https://golf-course-database.com) - Premium option
- [GolfAPI.io](https://golfapi.io) - Comprehensive but unreliable
- [Wynn Golf Club on BlueGolf](https://course.bluegolf.com/bluegolf/course/course/wynngcnv/) - Proof course exists in other DBs
- [Wynn Golf Club on GolfPass](https://www.golfpass.com/travel-advisor/courses/16151-wynn-golf-club) - Additional reference

---

## Related Issues

- Issue #002: Manual Course Entry
- Issue #003: Fallback API Options (superseded by this issue)
