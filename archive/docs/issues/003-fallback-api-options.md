# Issue: Evaluate Fallback Golf Course APIs

## Priority: Low

## Problem Statement

Currently we rely solely on GolfCourseAPI.com for course data. If this API becomes unavailable, has data gaps, or changes pricing, we have no fallback option.

## Current Provider

**GolfCourseAPI.com**
- Free tier: 300 requests/day
- ~30,000 courses worldwide
- Includes tee data, ratings, hole info
- No SLA or uptime guarantee

## Alternative APIs Researched

### Free Options

| Provider | Coverage | Pros | Cons |
|----------|----------|------|------|
| [GolfCourseAPI](https://golfcourseapi.com) | ~30K worldwide | Free, good data | Rate limited, no SLA |
| [golf-data-docs](https://github.com/Jacobbrewer1/golf-data-docs) | UK only | Open source | Limited coverage |
| Government Open Data | Regional only | Free, official | Very limited scope |

### Paid Options

| Provider | Coverage | Pricing | Notes |
|----------|----------|---------|-------|
| [GolfAPI.io](https://golfapi.io) | 42K+ courses, 100+ countries | Paid (unknown) | CSV export available, most comprehensive |
| [Zyla API Hub](https://zylalabs.com/api-marketplace/tag/golf) | Various regional APIs | Per-request | Multiple region-specific APIs |
| [RapidAPI Golf APIs](https://rapidapi.com/search/golf) | Varies | Freemium/Paid | Marketplace of various providers |
| GolfLogix | Extensive | Subscription or per-request | Premium mapping data |

## Recommendation

### Short Term (No Action Needed)
- GolfCourseAPI is sufficient for MVP
- Our caching strategy (Issue #001) reduces API dependency
- Manual course entry (Issue #002) covers gaps

### Medium Term (If Issues Arise)
1. **GolfAPI.io** - Best fallback candidate
   - Larger database (42K vs 30K)
   - CSV export option (one-time bulk import)
   - Worth evaluating pricing

2. **Zyla Regional APIs** - For specific coverage gaps
   - Could supplement primary API for certain regions

### Long Term (If Scaling)
- Consider CSV bulk import from GolfAPI.io
- Build adapter pattern to swap APIs easily
- Implement data merge from multiple sources

## Technical Approach (If Implemented)

### Adapter Pattern
```typescript
interface GolfCourseProvider {
  search(query: string): Promise<Course[]>;
  getDetails(id: string): Promise<CourseDetails>;
  isAvailable(): Promise<boolean>;
}

class GolfCourseAPIProvider implements GolfCourseProvider { }
class GolfAPIioProvider implements GolfCourseProvider { }

// Fallback chain
const providers = [
  new GolfCourseAPIProvider(),
  new GolfAPIioProvider(),
];
```

### Data Normalization
Each provider returns different formats. Normalize to our schema:
- Map external IDs with provider prefix: `golfcourseapi:4827`, `golfapiio:12345`
- Store provider source in database
- Handle rating/slope differences between sources

## Acceptance Criteria

- [ ] Document adapter interface for golf course providers
- [ ] Evaluate GolfAPI.io pricing and capabilities
- [ ] Create provider abstraction in codebase
- [ ] Implement fallback logic (try primary, fall back to secondary)

## Out of Scope

- Implementing multiple providers now
- Bulk data import
- Data reconciliation between providers

---

## References

- [GolfCourseAPI](https://golfcourseapi.com) - Current provider
- [GolfAPI.io](https://golfapi.io) - Best fallback candidate
- [Zyla Golf APIs](https://zylalabs.com/api-marketplace/tag/golf) - Regional options
- [RapidAPI Golf](https://rapidapi.com/search/golf) - API marketplace
