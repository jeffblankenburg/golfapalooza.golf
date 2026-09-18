import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * GET /api/v2/courses/suggested?lat=&lng= — the 5 courses to show first in the
 * "log a round" picker (mobile: keep the default list short).
 *   • With lat/lng → the 5 NEAREST courses (Haversine), each with distance_mi.
 *   • Without location → the golfer's 5 most-recently-played, backfilled with
 *     other library courses (alphabetical) if they've played fewer than 5.
 * Search (`/courses/search`) handles narrowing to anything else.
 */
const MI = 3958.8;
function distanceMi(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * MI * Math.asin(Math.sqrt(s));
}

interface CourseLite {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  distance_mi?: number;
}

export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  // (0,0) is "Null Island" — a classic bad-geolocation value, never a real
  // golfer. Treat it (and non-finite values) as no location.
  const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  const admin = v2AdminClient();

  // The picker lists the WHOLE library (top 5 prioritized), so page past
  // PostgREST's 1000-row cap.
  type Row = CourseLite & { latitude?: number | null; longitude?: number | null };
  async function allCourses(): Promise<Row[]> {
    const out: Row[] = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data } = await admin
        .from("v2_courses")
        .select("id, name, club_name, city, state, latitude, longitude")
        .order("name", { ascending: true })
        .range(from, from + size - 1);
      const page = (data || []) as Row[];
      out.push(...page);
      if (page.length < size) break;
    }
    return out;
  }
  const lite = (c: Row): CourseLite => ({ id: c.id, name: c.name, club_name: c.club_name, city: c.city, state: c.state });

  if (hasLoc) {
    // Every course, nearest first; those without coordinates fall to the bottom.
    const all = await allCourses();
    const ranked = all
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => ({ ...lite(c), distance_mi: Math.round(distanceMi(lat, lng, Number(c.latitude), Number(c.longitude)) * 10) / 10 }))
      .sort((a, b) => a.distance_mi - b.distance_mi);
    const rest = all.filter((c) => c.latitude == null || c.longitude == null).map(lite);
    return NextResponse.json({ basis: "nearby", courses: [...ranked, ...rest] });
  }

  // Recently played (top 5), then the rest of the whole library (alphabetical).
  const { data: recentRows } = await admin
    .from("v2_rounds")
    .select("round_date, course:v2_courses(id, name, club_name, city, state), players:v2_round_players!inner(user_id)")
    .eq("players.user_id", userId)
    .order("round_date", { ascending: false })
    .limit(60);

  const seen = new Set<string>();
  const courses: CourseLite[] = [];
  for (const r of recentRows || []) {
    const c = (Array.isArray(r.course) ? r.course[0] : r.course) as CourseLite | null;
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      courses.push(lite(c));
      if (courses.length >= 5) break;
    }
  }
  for (const c of await allCourses()) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      courses.push(lite(c));
    }
  }

  return NextResponse.json({ basis: "recent", courses });
}
