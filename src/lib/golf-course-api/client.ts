import type { GcApiCourse, GcApiSearchResponse } from "./types";

const BASE_URL = "https://api.golfcourseapi.com/v1";

// GolfCourseAPI free tier is 300 requests/day with a per-minute burst limit.
// We don't proactively throttle here; the cascade caches DB hits aggressively
// so a busy day rarely re-queries the same course.

function apiKey() {
  return process.env.GOLF_COURSE_API_KEY || "";
}

export function isGcApiConfigured(): boolean {
  return !!apiKey();
}

async function gcFetch<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("GOLF_COURSE_API_KEY not configured");

  const url = new URL(`${BASE_URL}${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.append(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error("GolfCourseAPI rate limit exceeded");
    throw new Error(`GolfCourseAPI error ${res.status}`);
  }

  return res.json();
}

/** Free-text course search. Returns an empty array on miss; throws on infra errors. */
export async function searchGcApiCourses(query: string): Promise<GcApiCourse[]> {
  if (!query.trim()) return [];
  const json = await gcFetch<GcApiSearchResponse>("/search", { search_query: query });
  return json.courses || [];
}

/** Fetch full course detail (with all tees/holes) by GolfCourseAPI numeric id. */
export async function getGcApiCourse(id: number): Promise<GcApiCourse | null> {
  try {
    const json = await gcFetch<{ course: GcApiCourse }>(`/courses/${id}`);
    return json.course || null;
  } catch {
    return null;
  }
}
