import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { geocodeAddress } from "@/lib/geocode";

// GET - Fetch course for the active trip with all tees
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const teeId = searchParams.get("tee_id");
  const listAll = searchParams.get("list");
  const directCourseId = searchParams.get("course_id");

  const adminClient = createAdminClient();

  // List all courses (for course picker / standalone courses page)
  if (listAll === "true") {
    const { data: courses, error } = await adminClient
      .from("courses")
      .select("id, name, city, state, hole_count, locked")
      .order("name");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ courses: courses || [] });
  }

  // Resolve course_id: either from direct param or from active trip
  let courseId: string | null = directCourseId;
  let tripId: string | null = null;

  if (!courseId) {
    const { data: trip } = await adminClient
      .from("trip_settings")
      .select("id, course_id")
      .eq("status", "active")
      .single();

    courseId = trip?.course_id || null;
    tripId = trip?.id || null;
  }

  if (!courseId) {
    return NextResponse.json({ course: null, tees: [], trip_id: tripId });
  }

  const { data: course, error } = await adminClient
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch all tees
  const { data: tees } = await adminClient
    .from("course_tees")
    .select("*")
    .eq("course_id", course.id)
    .order("course_rating", { ascending: false });

  // Determine which tee's holes to return
  const selectedTeeId = teeId || tees?.[0]?.id;

  // Fetch holes for selected tee
  const { data: holes } = await adminClient
    .from("course_holes")
    .select("*")
    .eq("course_id", course.id)
    .eq("tee_id", selectedTeeId)
    .order("hole_number");

  // Backfill: sync images from sibling tees for any holes missing images
  if (holes && holes.length > 0) {
    const missingOverhead = holes.filter((h) => !h.overhead_image_url).map((h) => h.hole_number);
    const missingGreen = holes.filter((h) => !h.green_image_url).map((h) => h.hole_number);

    if (missingOverhead.length > 0 || missingGreen.length > 0) {
      const allMissing = [...new Set([...missingOverhead, ...missingGreen])];
      const { data: siblingHoles } = await adminClient
        .from("course_holes")
        .select("hole_number, overhead_image_url, green_image_url")
        .eq("course_id", course.id)
        .neq("tee_id", selectedTeeId)
        .in("hole_number", allMissing)
        .order("hole_number");

      if (siblingHoles && siblingHoles.length > 0) {
        // Build a map of hole_number → best available image URLs
        const imageMap: Record<number, { overhead?: string; green?: string }> = {};
        for (const sh of siblingHoles) {
          if (!imageMap[sh.hole_number]) imageMap[sh.hole_number] = {};
          if (sh.overhead_image_url && !imageMap[sh.hole_number].overhead)
            imageMap[sh.hole_number].overhead = sh.overhead_image_url;
          if (sh.green_image_url && !imageMap[sh.hole_number].green)
            imageMap[sh.hole_number].green = sh.green_image_url;
        }

        // Update current tee's holes and patch the response data in-place
        const updates: Promise<unknown>[] = [];
        for (const hole of holes) {
          const imgs = imageMap[hole.hole_number];
          if (!imgs) continue;
          const patch: Record<string, string> = {};
          if (!hole.overhead_image_url && imgs.overhead) {
            patch.overhead_image_url = imgs.overhead;
            hole.overhead_image_url = imgs.overhead;
          }
          if (!hole.green_image_url && imgs.green) {
            patch.green_image_url = imgs.green;
            hole.green_image_url = imgs.green;
          }
          if (Object.keys(patch).length > 0) {
            updates.push(
              adminClient.from("course_holes").update(patch).eq("id", hole.id)
            );
          }
        }
        if (updates.length > 0) await Promise.all(updates);
      }
    }
  }

  return NextResponse.json({
    course,
    tees: tees || [],
    holes: holes || [],
    selected_tee_id: selectedTeeId,
    trip_id: tripId,
  });
}

// POST - Create a new course with 18 holes and link to active trip
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, city, state, tee_name, course_rating, slope_rating, par } =
      body;

    if (!name) {
      return NextResponse.json(
        { error: "Course name is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Create course
    const { data: course, error: courseError } = await adminClient
      .from("courses")
      .insert({
        name,
        city: city || null,
        state: state || null,
        hole_count: 18,
      })
      .select()
      .single();

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    // Create tee
    const { data: tee, error: teeError } = await adminClient
      .from("course_tees")
      .insert({
        course_id: course.id,
        tee_name: tee_name || "White",
        course_rating: course_rating || 72.0,
        slope_rating: slope_rating || 113,
        par: par || 72,
      })
      .select()
      .single();

    if (teeError) {
      return NextResponse.json({ error: teeError.message }, { status: 500 });
    }

    // Create 18 holes with defaults
    const holesData = Array.from({ length: 18 }, (_, i) => ({
      course_id: course.id,
      tee_id: tee.id,
      hole_number: i + 1,
      par: 4,
      handicap_index: i + 1,
      yards: 350,
    }));

    const { error: holesError } = await adminClient
      .from("course_holes")
      .insert(holesData);

    if (holesError) {
      return NextResponse.json({ error: holesError.message }, { status: 500 });
    }

    // Optionally link course to a trip
    if (body.link_to_trip) {
      await adminClient
        .from("trip_settings")
        .update({ course_id: course.id })
        .eq("id", body.link_to_trip);
    }

    return NextResponse.json({ course, tee });
  } catch (error) {
    console.error("Create course error:", error);
    return NextResponse.json(
      { error: "Failed to create course" },
      { status: 500 }
    );
  }
}

// PUT - Update course and tee info
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      course_id,
      tee_id,
      name,
      city,
      state,
      address,
      phone,
      website,
      tee_name,
      course_rating,
      slope_rating,
      par,
    } = body;

    if (!course_id) {
      return NextResponse.json(
        { error: "Course ID is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Auto-geocode when saving course info
    const coords = await geocodeAddress({ address, city, state, name });

    // Update course
    const { error: courseError } = await adminClient
      .from("courses")
      .update({
        name,
        city: city || null,
        state: state || null,
        address: address || null,
        phone: phone || null,
        website: website || null,
        latitude: coords ? coords[0] : undefined,
        longitude: coords ? coords[1] : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", course_id);

    if (courseError) {
      return NextResponse.json({ error: courseError.message }, { status: 500 });
    }

    // Update tee
    if (tee_id) {
      const { error: teeError } = await adminClient
        .from("course_tees")
        .update({
          tee_name: tee_name || "White",
          course_rating: course_rating || 72.0,
          slope_rating: slope_rating || 113,
          par: par || 72,
        })
        .eq("id", tee_id);

      if (teeError) {
        return NextResponse.json({ error: teeError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update course error:", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 }
    );
  }
}
