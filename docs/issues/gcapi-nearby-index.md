# Index GolfCourseAPI courses locally so "Near me" can offer "+ Add"

## Background

GolfCourseAPI's `/courses?latitude=&longitude=&radius_miles=` endpoint **does not actually geo-filter**. It silently ignores the lat/lng/radius parameters and returns the same paginated list of all ~25,700 courses keyed by ascending id.

Empirical test (Columbus, OH — `lat=40, lng=-83, radius_miles=25`):

```
metadata: { current_page: 1, page_size: 20, last_page: 1285, total_records: 25697 }
states of first 20 results: AL, AL, PR, KY, PR, KY, AL, AL, OH, KY, AL, ...
distances from (40, -83):
  Cherokee Country Club (AL)     → 432.2 mi
  Cumberland Lake (AL)            → 475.7 mi
  Coco Beach (PR)                 → 1809.7 mi
  ...
  closest: Clovernook CC (OH)     → 99.3 mi
```

A query with `radius_miles=2` returns the same payload. With no params, also the same. The endpoint is just `GET /courses` paginated.

This was discovered during Phase 2 of [`docs/issues/courses-near-you.md`](./courses-near-you.md). Phase 1 (cached courses, distance-sorted, permission UX) shipped. Phase 2 (uncached GCAPI courses surfaced as "+ Add" rows) was rolled back to this issue.

## Goal

Make the round-creation "Near me" search also surface courses that exist in GCAPI but haven't been imported into our `courses` table, with a one-tap "+ Add" path that commits them via the existing lookup-cascade confirmation modal.

## Approach: local read-only index

Build a `gcapi_index` table populated via a one-time backfill, refreshed on a slow cadence. Nearby queries hit the index, not GCAPI.

### Migration

```sql
CREATE TABLE gcapi_index (
  external_id TEXT PRIMARY KEY,                    -- e.g. "4609"
  club_name   TEXT,
  course_name TEXT,
  city        TEXT,
  state       TEXT,
  country     TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gcapi_index_state_idx  ON gcapi_index(state);
CREATE INDEX gcapi_index_coords_idx ON gcapi_index(latitude, longitude);
```

No tee data — only enough to render a row and dedup. Tees are fetched lazily when the user taps "+ Add" (the existing `/lookup/from-gcapi` endpoint already does that).

### Backfill script — `scripts/backfill-gcapi-index.mjs`

- Page through `GET /courses` (page_size=20) from page 1 to `metadata.last_page` (~1,285 pages).
- Upsert each batch into `gcapi_index` keyed on `external_id`.
- Throttle so a cold run respects the 300/day quota (≈5 days), or coordinate a one-time burst with GCAPI support.
- Idempotent — re-running just bumps `fetched_at`.

### Nearby query

In `/api/courses?lat&lng&radius&include_external=true`, after the existing DB query:

```ts
const latPad = radius / 69;
const lngPad = radius / (69 * Math.cos((lat * Math.PI) / 180));
const { data: external } = await admin
  .from("gcapi_index")
  .select("external_id, club_name, course_name, city, state, latitude, longitude")
  .gte("latitude",  lat - latPad)
  .lte("latitude",  lat + latPad)
  .gte("longitude", lng - lngPad)
  .lte("longitude", lng + lngPad);
```

Then haversine-filter to the precise radius and dedup against `courses.external_id` and the normalized `lookup_key` exactly as the rolled-back code did.

### Refresh strategy

GCAPI rarely adds new US courses. Order of effort:

1. **Manual quarterly** — admin-triggered button at `/admin/courses` runs the backfill script. Lean: ship with this.
2. **Incremental** — track `max(external_id)` seen, fetch only ids above that on refresh.
3. **On-demand** — when a user's `/search` returns ids not in the index, upsert them.

## UX (already designed and built — to be reinstated)

- "Near me" → `/api/courses?lat&lng&radius&include_external=true`
- Cached rows render normally (Phase 1 behavior).
- Uncached rows render with a small blue `+ Add` badge.
- Tap a `+ Add` row → opens `CourseLookupModal` in `preresolvedExternalId` mode → calls `POST /api/courses/lookup/from-gcapi` → confirms → commits.

## Starting code (rolled back from Phase 2 — preserved here)

This issue rolls back five chunks of working code. They're correct under the assumption that there's a working geo-source — re-introduce them as-is and just swap the GCAPI HTTP call for a `gcapi_index` SELECT.

### 1. `src/lib/golf-course-api/client.ts` — replace with index reader

Remove this fn (it calls the broken endpoint) and replace with a `getGcApiCoursesPage(page)` helper for the backfill:

```ts
export async function searchGcApiCoursesByLocation(
  latitude: number,
  longitude: number,
  radiusMiles: number = 25
): Promise<GcApiCourse[]> {
  const json = await gcFetch<GcApiSearchResponse>("/courses", {
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    radius_miles: radiusMiles.toString(),
  });
  return json.courses || [];
}
```

### 2. `src/app/api/courses/route.ts` — revive merge logic, swap source

After the existing nearby DB query, before returning, run the index query, dedup, merge, sort, slice:

```ts
const includeExternal = searchParams.get("include_external") === "true";

// ... existing dbQuery + cached array ...

if (isNearby && includeExternal) {
  // Bounding-box prefilter so we don't scan all 25k rows.
  const latPad = radius / 69;
  const lngPad = radius / (69 * Math.cos((lat * Math.PI) / 180));
  const { data: rows } = await admin
    .from("gcapi_index")
    .select("external_id, club_name, course_name, city, state, latitude, longitude")
    .gte("latitude",  lat - latPad)
    .lte("latitude",  lat + latPad)
    .gte("longitude", lng - lngPad)
    .lte("longitude", lng + lngPad);

  const externalIds = new Set(dbRows.map((c) => c.external_id).filter(Boolean) as string[]);
  const lookupKeys  = new Set(dbRows.map((c) => c.lookup_key).filter(Boolean) as string[]);

  const external = (rows || [])
    .filter((c) => {
      if (externalIds.has(c.external_id)) return false;
      const club = c.club_name || "";
      const course = c.course_name || "";
      const fullName = club && course && club !== course ? `${club} ${course}` : course || club;
      const key = buildLookupKey(fullName, c.state || "", c.city);
      return !lookupKeys.has(key);
    })
    .map((c) => ({
      id: `gcapi:${c.external_id}`,
      external_id: c.external_id,
      source: "gcapi" as const,
      uncached: true,
      name: c.course_name || c.club_name || "",
      club_name: c.club_name,
      city: c.city,
      state: c.state,
      hole_count: null,
      latitude: c.latitude,
      longitude: c.longitude,
      distance_mi: haversineMi(lat, lng, c.latitude, c.longitude),
    }))
    .filter((c) => c.distance_mi <= radius);

  const merged = [...cached, ...external]
    .sort((a, b) => a.distance_mi - b.distance_mi)
    .slice(0, 20);
  return NextResponse.json({ courses: merged });
}
```

### 3. `src/app/api/courses/lookup/from-gcapi/route.ts` — restore verbatim

Whole file. Already short-circuits to an existing row by `external_id` or `lookup_key`, otherwise calls `getGcApiCourse(id)` and `normalizeFromGcApi` to produce a confirmable draft. Returns the same draft shape `/lookup` does.

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGcApiCourse, isGcApiConfigured } from "@/lib/golf-course-api/client";
import { buildLookupKey, normalizeFromGcApi } from "@/lib/courses/scorecard";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { external_id?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const externalId = (body.external_id || "").trim();
  if (!externalId) return NextResponse.json({ error: "external_id is required" }, { status: 400 });
  if (!isGcApiConfigured()) return NextResponse.json({ error: "GolfCourseAPI not configured" }, { status: 503 });
  const externalIdNum = Number(externalId);
  if (!Number.isFinite(externalIdNum)) return NextResponse.json({ error: "external_id must be numeric" }, { status: 400 });

  const admin = createAdminClient();

  const { data: byExternal } = await admin
    .from("courses")
    .select("id, name, club_name, city, state, hole_count, source, verified")
    .eq("external_id", externalId)
    .maybeSingle();
  if (byExternal) return NextResponse.json({ step: "cache", committed: true, course: byExternal });

  const course = await getGcApiCourse(externalIdNum);
  if (!course) return NextResponse.json({ error: "Course not found in GolfCourseAPI" }, { status: 404 });

  const normalized = normalizeFromGcApi(course);
  if (!normalized) {
    return NextResponse.json(
      { error: "GolfCourseAPI returned this course without usable tee data" },
      { status: 422 }
    );
  }

  const lookupKey = buildLookupKey(
    normalized.course.club_name && normalized.course.club_name !== normalized.course.name
      ? `${normalized.course.club_name} ${normalized.course.name}`
      : normalized.course.name,
    normalized.course.state || "",
    normalized.course.city
  );
  const { data: byKey } = await admin
    .from("courses")
    .select("id, name, club_name, city, state, hole_count, source, verified")
    .eq("lookup_key", lookupKey)
    .maybeSingle();
  if (byKey) return NextResponse.json({ step: "cache", committed: true, course: byKey });

  return NextResponse.json({
    step: "gcapi",
    committed: false,
    draft: {
      lookup_key: lookupKey,
      confidence: normalized.confidence,
      source: normalized.source,
      course: normalized.course,
      hole_count: normalized.hole_count,
      tees: normalized.tees,
      source_urls: normalized.source_urls,
      notes: normalized.notes,
      external_id: normalized.external_id,
      model: null,
    },
  });
}
```

### 4. `src/components/my-rounds/CourseLookupModal.tsx` — pre-resolved entry mode

Add a `preresolvedExternalId?: string` prop. When set, skip the input phase and resolve the draft via `/lookup/from-gcapi`:

```tsx
interface Props {
  initialName?: string;
  preresolvedExternalId?: string;
  onClose: () => void;
  onCourseReady: (course: CommittedCourse) => void;
  onManualFallback: (prefill: { name: string; city?: string; state: string }) => void;
}

// In the component:
const [phase, setPhase] = useState<"input" | "loading" | "select" | "confirm" | "error">(
  preresolvedExternalId ? "loading" : "input"
);

useEffect(() => {
  if (!preresolvedExternalId) return;
  let cancelled = false;
  (async () => {
    try {
      const res = await fetch("/api/courses/lookup/from-gcapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_id: preresolvedExternalId }),
      });
      const data: LookupResponse = await res.json().catch(() => ({} as LookupResponse));
      if (cancelled) return;
      if (res.ok && data.committed && data.course) { onCourseReady(data.course); return; }
      if (res.ok && data.draft) { setResponse(data); setPhase("confirm"); return; }
      setStatusMsg(data.error || "Couldn't load that course."); setPhase("error");
    } catch {
      if (cancelled) return;
      setStatusMsg("Network error. Please try again."); setPhase("error");
    }
  })();
  return () => { cancelled = true; };
}, [preresolvedExternalId]);
```

### 5. `src/components/my-rounds/RoundForm.tsx` — "+ Add" badge + click branch

```tsx
interface CourseSummary {
  // ...
  uncached?: boolean;
  external_id?: string | null;
}

const [lookupExternalId, setLookupExternalId] = useState<string | null>(null);

// fetchNearby URL:
`/api/courses?lat=${lat}&lng=${lng}&radius=${NEARBY_RADIUS_MI}&include_external=true`

// Row click + render:
<button onClick={() => {
  if (c.uncached && c.external_id) {
    setLookupExternalId(c.external_id);
    setLookupOpen(true);
  } else {
    selectCourse(c);
  }
}}>
  <div className="flex items-baseline justify-between gap-2">
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="text-sm font-medium text-gray-900 min-w-0">{formatCourseName(c)}</div>
      {c.uncached && (
        <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">
          + Add
        </span>
      )}
    </div>
    {nearbyActive && c.distance_mi != null && (
      <div className="text-xs text-gray-500 shrink-0 tabular-nums">{formatDistance(c.distance_mi)}</div>
    )}
  </div>
  ...
</button>

// Modal usage:
<CourseLookupModal
  initialName={lookupExternalId ? "" : searchQuery}
  preresolvedExternalId={lookupExternalId ?? undefined}
  onClose={() => { setLookupOpen(false); setLookupExternalId(null); }}
  ...
/>
```

### 6. `CLAUDE.md` — re-document

Restore the rows for `&include_external=true` on `GET /api/courses` and for `POST /api/courses/lookup/from-gcapi`.

## Acceptance criteria

- [ ] `gcapi_index` migration created and applied
- [ ] One-time backfill script populates the index from GCAPI's paginated `/courses`
- [ ] `/api/courses?lat&lng&radius&include_external=true` returns merged cached + uncached rows, sorted by distance, with the dedup logic from above
- [ ] Tapping a `+ Add` row in `RoundForm` opens the confirmation modal pre-loaded with the GCAPI scorecard
- [ ] Refresh strategy in place (at minimum a manual admin trigger)
- [ ] CLAUDE.md updated for both `&include_external=true` and `/lookup/from-gcapi`

## Related

- [`docs/issues/courses-near-you.md`](./courses-near-you.md) — original "Near me" plan
- Phase 1 (Near me / cached only) — shipped
- Phase 2 — rolled back to this issue
