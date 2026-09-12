import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { geocodeAddress } from "@/lib/v2/geocode";

/** Great-circle distance in miles (small library, app-side is fine). */
function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** GET — search / list courses (optionally nearby via lat/lng/radius). */
export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const latParam = searchParams.get("lat");
  const lngParam = searchParams.get("lng");
  const radiusParam = searchParams.get("radius");
  const lat = latParam !== null ? parseFloat(latParam) : NaN;
  const lng = lngParam !== null ? parseFloat(lngParam) : NaN;
  const radius = radiusParam !== null ? parseFloat(radiusParam) : 25;
  const isNearby = Number.isFinite(lat) && Number.isFinite(lng);

  const admin = v2AdminClient();
  let dbQuery = admin
    .from("v2_courses")
    .select("id, name, club_name, city, state, hole_count, latitude, longitude");

  if (isNearby) {
    dbQuery = dbQuery.not("latitude", "is", null).not("longitude", "is", null);
  } else {
    dbQuery = dbQuery.order("name");
  }
  if (query) {
    dbQuery = dbQuery.or(`name.ilike.%${query}%,club_name.ilike.%${query}%,city.ilike.%${query}%,state.ilike.%${query}%`);
  }

  const { data, error } = await dbQuery;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let courses = data || [];
  if (isNearby) {
    courses = courses
      .map((c) => ({ ...c, distance_mi: haversineMi(lat, lng, c.latitude as number, c.longitude as number) }))
      .filter((c) => c.distance_mi <= radius)
      .sort((a, b) => a.distance_mi - b.distance_mi)
      .slice(0, 20);
  }
  return NextResponse.json({ courses });
}

/** POST — create a manual course with an initial tee + default holes. */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, city, state, address, phone, website, hole_count, tee_name, tee_color, course_rating, slope_rating, par } = body;
    if (!name) return NextResponse.json({ error: "Course name is required" }, { status: 400 });

    const holes = hole_count === 9 ? 9 : 18;
    const coords = await geocodeAddress({ address, city, state, name });
    const admin = v2AdminClient();

    const { data: course, error: courseError } = await admin
      .from("v2_courses")
      .insert({
        name,
        city: city || null,
        state: state || null,
        address: address || null,
        phone: phone || null,
        website: website || null,
        hole_count: holes,
        latitude: coords ? coords[0] : null,
        longitude: coords ? coords[1] : null,
        source: "manual",
        verified: true,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (courseError) return NextResponse.json({ error: courseError.message }, { status: 500 });

    const { data: tee, error: teeError } = await admin
      .from("v2_course_tees")
      .insert({
        course_id: course.id,
        tee_name: tee_name || "White",
        tee_color: tee_color || null,
        course_rating: course_rating || null,
        slope_rating: slope_rating || null,
        par: par || (holes === 9 ? 36 : 72),
      })
      .select()
      .single();
    if (teeError) return NextResponse.json({ error: teeError.message }, { status: 500 });

    const holesData = Array.from({ length: holes }, (_, i) => ({
      course_id: course.id,
      tee_id: tee.id,
      hole_number: i + 1,
      par: 4,
      handicap_index: i + 1,
      yards: 350,
    }));
    const { error: holesError } = await admin.from("v2_course_holes").insert(holesData);
    if (holesError) return NextResponse.json({ error: holesError.message }, { status: 500 });

    return NextResponse.json({ course, tee });
  } catch {
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
