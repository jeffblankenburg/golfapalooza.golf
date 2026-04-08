import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET - List tees for a course
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: tees, error } = await supabase
    .from("course_tees")
    .select("*")
    .eq("course_id", id)
    .order("course_rating", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tees: tees || [] });
}

// POST - Add a new tee to a course
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  try {
    const body = await request.json();
    const { tee_name, tee_color, course_rating, slope_rating, par, total_yards } = body;

    if (!tee_name) {
      return NextResponse.json(
        { error: "Tee name is required" },
        { status: 400 }
      );
    }

    // Get course hole count
    const { data: course } = await supabase
      .from("courses")
      .select("hole_count")
      .eq("id", courseId)
      .single();

    const holeCount = course?.hole_count || 18;

    // Create tee
    const { data: tee, error: teeError } = await supabase
      .from("course_tees")
      .insert({
        course_id: courseId,
        tee_name,
        tee_color: tee_color || null,
        course_rating: course_rating || null,
        slope_rating: slope_rating || null,
        par: par || (holeCount === 9 ? 36 : 72),
        total_yards: total_yards || null,
      })
      .select()
      .single();

    if (teeError) {
      return NextResponse.json({ error: teeError.message }, { status: 500 });
    }

    // Try to copy hole data from existing tee, or create defaults
    const { data: existingTees } = await supabase
      .from("course_tees")
      .select("id")
      .eq("course_id", courseId)
      .neq("id", tee.id)
      .limit(1);

    let holeTemplate: { hole_number: number; par: number; handicap_index: number; yards: number | null }[] = [];

    if (existingTees && existingTees.length > 0) {
      const { data: templateHoles } = await supabase
        .from("course_holes")
        .select("hole_number, par, handicap_index, yards")
        .eq("tee_id", existingTees[0].id)
        .order("hole_number");
      if (templateHoles) holeTemplate = templateHoles;
    }

    const holesData = Array.from({ length: holeCount }, (_, i) => {
      const template = holeTemplate.find((h) => h.hole_number === i + 1);
      return {
        course_id: courseId,
        tee_id: tee.id,
        hole_number: i + 1,
        par: template?.par || 4,
        handicap_index: template?.handicap_index || i + 1,
        yards: total_yards ? Math.round(total_yards / holeCount) : (template?.yards || 350),
      };
    });

    await supabase.from("course_holes").insert(holesData);

    return NextResponse.json({ tee });
  } catch {
    return NextResponse.json({ error: "Failed to create tee" }, { status: 500 });
  }
}

// PUT - Update a tee
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await params; // consume params

  try {
    const body = await request.json();
    const { tee_id, tee_name, tee_color, course_rating, slope_rating, par, total_yards,
      front_nine_rating, front_nine_slope, back_nine_rating, back_nine_slope } = body;

    if (!tee_id) {
      return NextResponse.json({ error: "tee_id is required" }, { status: 400 });
    }

    // Only include fields that were actually provided
    const updateData: Record<string, unknown> = {};
    if (tee_name !== undefined) updateData.tee_name = tee_name;
    if (tee_color !== undefined) updateData.tee_color = tee_color || null;
    if (course_rating !== undefined) updateData.course_rating = course_rating;
    if (slope_rating !== undefined) updateData.slope_rating = slope_rating;
    if (par !== undefined) updateData.par = par;
    if (total_yards !== undefined) updateData.total_yards = total_yards || null;
    if (front_nine_rating !== undefined) updateData.front_nine_rating = front_nine_rating || null;
    if (front_nine_slope !== undefined) updateData.front_nine_slope = front_nine_slope || null;
    if (back_nine_rating !== undefined) updateData.back_nine_rating = back_nine_rating || null;
    if (back_nine_slope !== undefined) updateData.back_nine_slope = back_nine_slope || null;

    const { error } = await supabase
      .from("course_tees")
      .update(updateData)
      .eq("id", tee_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update tee" }, { status: 500 });
  }
}
