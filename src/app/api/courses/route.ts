import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";

// GET - Search/list courses
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  let dbQuery = supabase
    .from("courses")
    .select("id, name, club_name, city, state, hole_count")
    .order("name");

  if (query) {
    dbQuery = dbQuery.or(`name.ilike.%${query}%,city.ilike.%${query}%,state.ilike.%${query}%`);
  }

  const { data: courses, error } = await dbQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ courses: courses || [] });
}

// POST - Create a new course with initial tee and default holes
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, city, state, address, phone, website, hole_count, tee_name, tee_color, course_rating, slope_rating, par } = body;

    if (!name) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    const holes = hole_count === 9 ? 9 : 18;

    // Geocode address to get coordinates
    const coords = await geocodeAddress({ address, city, state, name });

    // Create course
    const { data: course, error: courseError } = await supabase
      .from("courses")
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
      })
      .select()
      .single();

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    // Create initial tee
    const { data: tee, error: teeError } = await supabase
      .from("course_tees")
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

    if (teeError) {
      return NextResponse.json({ error: teeError.message }, { status: 500 });
    }

    // Create default holes
    const holesData = Array.from({ length: holes }, (_, i) => ({
      course_id: course.id,
      tee_id: tee.id,
      hole_number: i + 1,
      par: 4,
      handicap_index: i + 1,
      yards: 350,
    }));

    const { error: holesError } = await supabase
      .from("course_holes")
      .insert(holesData);

    if (holesError) {
      return NextResponse.json({ error: holesError.message }, { status: 500 });
    }

    return NextResponse.json({ course, tee });
  } catch {
    return NextResponse.json({ error: "Failed to create course" }, { status: 500 });
  }
}
