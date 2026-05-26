import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkCourseEditAccess, stampCourseEdit } from "@/lib/courses/edit-access";

/**
 * Issue #133. Tee box management — create/update/delete tees on an unlocked
 * course. Any signed-in user can edit unlocked courses; admins can edit any.
 */

// POST - Add a new tee box with 18 holes, or duplicate an existing one.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  let body: {
    course_id?: string;
    tee_name?: string;
    tee_color?: string | null;
    course_rating?: number;
    slope_rating?: number;
    par?: number;
    duplicate_from?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { course_id, tee_name, tee_color, course_rating, slope_rating, par, duplicate_from } = body;

  if (!course_id || !tee_name) {
    return NextResponse.json({ error: "course_id and tee_name are required" }, { status: 400 });
  }

  const access = await checkCourseEditAccess(course_id);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const admin = createAdminClient();

  let sourceRating = course_rating || 72.0;
  let sourceSlope = slope_rating || 113;
  let sourcePar = par || 72;
  let sourceColor = tee_color || null;

  if (duplicate_from) {
    const { data: sourceTee } = await admin
      .from("course_tees")
      .select("course_rating, slope_rating, par, tee_color")
      .eq("id", duplicate_from)
      .single();
    if (sourceTee) {
      sourceRating = sourceTee.course_rating;
      sourceSlope = sourceTee.slope_rating;
      sourcePar = sourceTee.par;
      sourceColor = sourceTee.tee_color;
    }
  }

  const { data: tee, error: teeError } = await admin
    .from("course_tees")
    .insert({
      course_id,
      tee_name,
      tee_color: sourceColor,
      course_rating: sourceRating,
      slope_rating: sourceSlope,
      par: sourcePar,
    })
    .select()
    .single();
  if (teeError) {
    return NextResponse.json({ error: teeError.message }, { status: 500 });
  }

  // Source holes: duplicate_from if set, else any existing tee on the course.
  let sourceHoles: { hole_number: number; par: number; handicap_index: number; yards: number; overhead_image_url: string | null; green_image_url: string | null }[] = [];

  if (duplicate_from) {
    const { data } = await admin
      .from("course_holes")
      .select("hole_number, par, handicap_index, yards, overhead_image_url, green_image_url")
      .eq("tee_id", duplicate_from)
      .order("hole_number");
    if (data) sourceHoles = data;
  } else {
    const { data: existingTees } = await admin
      .from("course_tees")
      .select("id")
      .eq("course_id", course_id)
      .neq("id", tee.id)
      .limit(1);
    if (existingTees && existingTees.length > 0) {
      const { data } = await admin
        .from("course_holes")
        .select("hole_number, par, handicap_index, yards, overhead_image_url, green_image_url")
        .eq("tee_id", existingTees[0].id)
        .order("hole_number");
      if (data) sourceHoles = data;
    }
  }

  const holesData = Array.from({ length: 18 }, (_, i) => ({
    course_id,
    tee_id: tee.id,
    hole_number: i + 1,
    par: sourceHoles[i]?.par ?? 4,
    handicap_index: sourceHoles[i]?.handicap_index ?? i + 1,
    yards: duplicate_from ? (sourceHoles[i]?.yards ?? 0) : 0,
    overhead_image_url: sourceHoles[i]?.overhead_image_url ?? null,
    green_image_url: sourceHoles[i]?.green_image_url ?? null,
  }));

  const { error: holesError } = await admin.from("course_holes").insert(holesData);
  if (holesError) {
    return NextResponse.json({ error: holesError.message }, { status: 500 });
  }

  await stampCourseEdit(course_id, effectiveUserId);
  return NextResponse.json({ tee });
}

// PUT - Update tee info.
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  let body: { tee_id?: string; tee_name?: string; tee_color?: string | null; course_rating?: number; slope_rating?: number; par?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { tee_id, tee_name, tee_color, course_rating, slope_rating, par } = body;
  if (!tee_id) {
    return NextResponse.json({ error: "tee_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the course id so we can gate the edit access.
  const { data: tee } = await admin
    .from("course_tees")
    .select("course_id")
    .eq("id", tee_id)
    .maybeSingle();
  if (!tee) {
    return NextResponse.json({ error: "Tee not found" }, { status: 404 });
  }

  const access = await checkCourseEditAccess(tee.course_id);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const updates: Record<string, unknown> = {};
  if (tee_name !== undefined) updates.tee_name = tee_name || "White";
  if (tee_color !== undefined) updates.tee_color = tee_color || null;
  if (course_rating !== undefined) updates.course_rating = course_rating || 72.0;
  if (slope_rating !== undefined) updates.slope_rating = slope_rating || 113;
  if (par !== undefined) updates.par = par || 72;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await admin.from("course_tees").update(updates).eq("id", tee_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await stampCourseEdit(tee.course_id, effectiveUserId);
  return NextResponse.json({ success: true });
}

// DELETE - Remove a tee and its holes.
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  const { searchParams } = new URL(request.url);
  const teeId = searchParams.get("tee_id");
  const courseId = searchParams.get("course_id");
  if (!teeId || !courseId) {
    return NextResponse.json({ error: "tee_id and course_id are required" }, { status: 400 });
  }

  const access = await checkCourseEditAccess(courseId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from("course_tees")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);
  if ((count || 0) <= 1) {
    return NextResponse.json({ error: "Cannot delete the last tee box" }, { status: 400 });
  }

  await admin.from("course_holes").delete().eq("tee_id", teeId);
  const { error } = await admin.from("course_tees").delete().eq("id", teeId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await stampCourseEdit(courseId, effectiveUserId);
  return NextResponse.json({ success: true });
}
