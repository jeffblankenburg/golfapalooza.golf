# Feature: Location-Based Course Detection

## Overview

Automatically detect which golf course a user is at based on their device's GPS location, eliminating the need to manually search for a course when starting a new round.

### Problem Statement

Currently, users must manually search for their golf course when starting a new round. This adds friction to the experience, especially when:
- Users are already physically at the course
- Course names are long or difficult to spell
- Multiple courses exist with similar names

### Inspiration

Apps like 18 Birdies use device location to automatically suggest the course you're at, allowing one-tap confirmation to start a round.

---

## User Experience Flow

### Happy Path
1. User taps "New Round"
2. App requests location permission (if not already granted)
3. App shows loading state: "Finding nearby courses..."
4. App detects user is at "Meadowbrook Country Club"
5. User sees: "Are you playing at **Meadowbrook Country Club**?" with a prominent "Yes" button
6. User taps "Yes" → advances directly to tee selection
7. If wrong, user taps "Search for a different course" → falls back to search

### Permission Denied / Location Unavailable
1. User taps "New Round"
2. Location permission denied or unavailable
3. App immediately shows the search interface (current behavior)
4. Optional: Show a subtle banner "Enable location for faster course detection"

### No Course Found Nearby
1. User taps "New Round"
2. Location granted, but no courses within radius
3. App shows: "No courses found nearby" with search interface
4. User proceeds with manual search

### Multiple Courses Nearby
1. User taps "New Round"
2. Location granted, multiple courses within radius (e.g., at a golf complex)
3. App shows: "Which course are you playing?" with list of 2-3 nearby options
4. User taps their course → advances to tee selection

---

## Technical Implementation

### Phase 1: API Updates

#### 1.1 Update Golf Course API Client

**File:** `src/lib/golf-course-api/client.ts`

Add a new method for geo-based search:

```typescript
async searchCoursesByLocation(
  latitude: number,
  longitude: number,
  radiusMiles: number = 2
): Promise<GolfCourseAPICourse[]> {
  const response = await this.fetch<GolfCourseAPIResponse>("/courses", {
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    radius_miles: radiusMiles.toString(),
  });
  return response.courses || [];
}
```

#### 1.2 Update Courses API Route

**File:** `src/app/api/courses/route.ts`

Extend the GET handler to accept location parameters:

```typescript
// New query params
const lat = searchParams.get("lat");
const lng = searchParams.get("lng");
const radius = searchParams.get("radius") || "2"; // miles

// If lat/lng provided, do geo search
if (lat && lng) {
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);
  const radiusMiles = parseFloat(radius);

  // Validate coordinates
  if (isNaN(latitude) || isNaN(longitude)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // First check cache for nearby courses
  const cachedNearby = await searchCoursesByLocation(latitude, longitude, radiusMiles);

  if (cachedNearby.length > 0) {
    return NextResponse.json({ courses: cachedNearby, source: "cache" });
  }

  // Query external API
  if (golfCourseAPI.isConfigured()) {
    const apiResults = await golfCourseAPI.searchCoursesByLocation(
      latitude, longitude, radiusMiles
    );
    // Cache and return results...
  }
}
```

#### 1.3 Add Geo Query to Cache Layer

**File:** `src/lib/golf-course-api/cache.ts`

Add function to search cached courses by location:

```typescript
export async function searchCoursesByLocation(
  latitude: number,
  longitude: number,
  radiusMiles: number
): Promise<Course[]> {
  const supabase = await createClient();

  // Use PostGIS or Haversine formula
  // Simple approach: bounding box + distance calculation
  const latDelta = radiusMiles / 69; // ~69 miles per degree latitude
  const lngDelta = radiusMiles / (69 * Math.cos(latitude * Math.PI / 180));

  const { data, error } = await supabase
    .from("courses")
    .select("*")
    .gte("latitude", latitude - latDelta)
    .lte("latitude", latitude + latDelta)
    .gte("longitude", longitude - lngDelta)
    .lte("longitude", longitude + lngDelta);

  if (error || !data) return [];

  // Calculate actual distances and sort
  return data
    .map(course => ({
      ...course,
      distance: calculateDistance(latitude, longitude, course.latitude, course.longitude)
    }))
    .filter(course => course.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance);
}

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  // Haversine formula
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
```

### Phase 2: Frontend Updates

#### 2.1 Create Location Hook

**File:** `src/hooks/useGeolocation.ts`

```typescript
import { useState, useCallback } from "react";

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
  loading: boolean;
  permissionState: PermissionState | null;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    error: null,
    loading: false,
    permissionState: null,
  });

  const requestLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setState(s => ({ ...s, error: "Geolocation not supported" }));
      return null;
    }

    setState(s => ({ ...s, loading: true, error: null }));

    return new Promise<GeolocationCoordinates | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setState({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            error: null,
            loading: false,
            permissionState: "granted",
          });
          resolve(position.coords);
        },
        (error) => {
          const errorMessage =
            error.code === error.PERMISSION_DENIED ? "Location permission denied" :
            error.code === error.POSITION_UNAVAILABLE ? "Location unavailable" :
            "Location request timed out";

          setState(s => ({
            ...s,
            error: errorMessage,
            loading: false,
            permissionState: error.code === error.PERMISSION_DENIED ? "denied" : null,
          }));
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000, // Cache for 1 minute
        }
      );
    });
  }, []);

  return { ...state, requestLocation };
}
```

#### 2.2 Create NearbyCourseSuggestion Component

**File:** `src/components/scoring/NearbyCourseSuggestion.tsx`

```typescript
interface NearbyCourseSuggestionProps {
  onCourseSelect: (course: Course) => void;
  onSearchInstead: () => void;
}

export function NearbyCourseSuggestion({
  onCourseSelect,
  onSearchInstead
}: NearbyCourseSuggestionProps) {
  const { latitude, longitude, error, loading, requestLocation } = useGeolocation();
  const [nearbyCourses, setNearbyCourses] = useState<Course[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "locating" | "searching" | "done" | "error">("idle");

  useEffect(() => {
    // Auto-request location on mount
    requestLocation();
  }, []);

  useEffect(() => {
    if (latitude && longitude) {
      searchNearbyCourses();
    }
  }, [latitude, longitude]);

  // ... render loading, results, or fallback to search
}
```

#### 2.3 Update New Round Page Flow

**File:** `src/app/(app)/scoring/new/page.tsx`

Modify the course step to:
1. First attempt location detection
2. Show nearby course suggestion if found
3. Fall back to search if no location or no nearby courses

```typescript
// New state
const [locationMode, setLocationMode] = useState<"detecting" | "suggestion" | "search">("detecting");
const [nearbyCourses, setNearbyCourses] = useState<Course[]>([]);

// In the course step render:
{currentStep === "course" && (
  <>
    {locationMode === "detecting" && (
      <LocationDetecting onComplete={(courses) => {
        if (courses.length > 0) {
          setNearbyCourses(courses);
          setLocationMode("suggestion");
        } else {
          setLocationMode("search");
        }
      }} />
    )}

    {locationMode === "suggestion" && (
      <NearbyCourseSuggestion
        courses={nearbyCourses}
        onSelect={handleCourseSelect}
        onSearchInstead={() => setLocationMode("search")}
      />
    )}

    {locationMode === "search" && (
      <CourseSearch onSelect={handleCourseSelect} />
    )}
  </>
)}
```

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Geolocation API not supported | Immediately fall back to search |
| Permission denied | Fall back to search, show optional prompt to enable |
| Permission prompt dismissed | Fall back to search |
| Location timeout (>10s) | Fall back to search with message |
| No courses within radius | Show "No courses nearby" + search |
| API rate limit exceeded | Use cached courses only |
| User is indoors (poor GPS) | Accept lower accuracy, widen radius |
| Multiple courses at same location | Show list for user to choose |

---

## Privacy Considerations

1. **Permission Prompt**: Browser handles the permission prompt. We should explain why we need location.

2. **Data Storage**: Location data is NOT stored on server. Only used transiently for the API query.

3. **Opt-out**: Users can always skip location and search manually.

4. **No Tracking**: We don't track user movement or store location history.

---

## API Documentation Updates

Add to Swagger docs:

```yaml
/api/courses:
  get:
    parameters:
      - in: query
        name: lat
        schema:
          type: number
        description: Latitude for geo search
      - in: query
        name: lng
        schema:
          type: number
        description: Longitude for geo search
      - in: query
        name: radius
        schema:
          type: number
          default: 2
        description: Search radius in miles
```

---

## Acceptance Criteria

- [ ] User can grant location permission when starting a new round
- [ ] If location granted and course found nearby, show suggestion with one-tap confirm
- [ ] If location granted but no course nearby, show search interface
- [ ] If location denied/unavailable, gracefully fall back to search
- [ ] Location request has reasonable timeout (10 seconds)
- [ ] Multiple nearby courses are shown as a list
- [ ] User can always choose "Search for a different course"
- [ ] Location data is not stored or transmitted beyond the course search
- [ ] Works on both mobile and desktop browsers
- [ ] Loading states are clear and informative

---

## Future Enhancements

1. **Remember preference**: If user always denies location, stop asking
2. **Favorite courses**: Show favorites first, then nearby
3. **Recent courses**: Combine with recently played courses
4. **Course check-in**: Verify user is at course during round (anti-cheat for competitions)
5. **Offline support**: Cache nearby courses for offline use

---

## Implementation Order

1. API client update (`searchCoursesByLocation`)
2. Cache layer geo query
3. API route extension
4. `useGeolocation` hook
5. `NearbyCourseSuggestion` component
6. New round page integration
7. Testing & edge cases
8. Documentation updates
