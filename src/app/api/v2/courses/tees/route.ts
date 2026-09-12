import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Tee-box management on the universal library — any signed-in user may edit. */

async function stamp(admin: SupabaseClient, courseId: string, userId: string) {
  await admin.from("v2_courses").update({ updated_at: new Date().toISOString(), updated_by: userId }).eq("id", courseId);
}

/** POST — add a tee (+18 holes), or duplicate an existing tee. */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    course_id?: string; tee_name?: string; tee_color?: string | null;
    course_rating?: number; slope_rating?: number; par?: number; duplicate_from?: string;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { course_id, tee_name, tee_color, course_rating, slope_rating, par, duplicate_from } = body;
  if (!course_id || !tee_name) return NextResponse.json({ error: "course_id and tee_name are required" }, { status: 400 });

  const admin = v2AdminClient();

  let sourceRating = course_rating ?? null;
  let sourceSlope = slope_rating ?? null;
  let sourcePar = par || 72;
  let sourceColor = tee_color || null;

  if (duplicate_from) {
    const { data: sourceTee } = await admin
      .from("v2_course_tees")
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
    .from("v2_course_tees")
    .insert({ course_id, tee_name, tee_color: sourceColor, course_rating: sourceRating, slope_rating: sourceSlope, par: sourcePar })
    .select()
    .single();
  if (teeError) return NextResponse.json({ error: teeError.message }, { status: 500 });

  let sourceHoles: { hole_number: number; par: number; handicap_index: number; yards: number; overhead_image_url: string | null; green_image_url: string | null }[] = [];
  if (duplicate_from) {
    const { data } = await admin
      .from("v2_course_holes")
      .select("hole_number, par, handicap_index, yards, overhead_image_url, green_image_url")
      .eq("tee_id", duplicate_from)
      .order("hole_number");
    if (data) sourceHoles = data;
  } else {
    const { data: existingTees } = await admin
      .from("v2_course_tees").select("id").eq("course_id", course_id).neq("id", tee.id).limit(1);
    if (existingTees && existingTees.length > 0) {
      const { data } = await admin
        .from("v2_course_holes")
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
  const { error: holesError } = await admin.from("v2_course_holes").insert(holesData);
  if (holesError) return NextResponse.json({ error: holesError.message }, { status: 500 });

  await stamp(admin, course_id, userId);
  return NextResponse.json({ tee });
}

/** PUT — update tee info. */
export async function PUT(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { tee_id?: string; tee_name?: string; tee_color?: string | null; course_rating?: number; slope_rating?: number; par?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const { tee_id, tee_name, tee_color, course_rating, slope_rating, par } = body;
  if (!tee_id) return NextResponse.json({ error: "tee_id is required" }, { status: 400 });

  const admin = v2AdminClient();
  const { data: tee } = await admin.from("v2_course_tees").select("course_id").eq("id", tee_id).maybeSingle();
  if (!tee) return NextResponse.json({ error: "Tee not found" }, { status: 404 });

  const updates: Record<string, unknown> = {};
  if (tee_name !== undefined) updates.tee_name = tee_name || "White";
  if (tee_color !== undefined) updates.tee_color = tee_color || null;
  if (course_rating !== undefined) updates.course_rating = course_rating || null;
  if (slope_rating !== undefined) updates.slope_rating = slope_rating || null;
  if (par !== undefined) updates.par = par || 72;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const { error } = await admin.from("v2_course_tees").update(updates).eq("id", tee_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await stamp(admin, tee.course_id, userId);
  return NextResponse.json({ success: true });
}

/** DELETE — remove a tee and its holes (never the last tee). */
export async function DELETE(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teeId = searchParams.get("tee_id");
  const courseId = searchParams.get("course_id");
  if (!teeId || !courseId) return NextResponse.json({ error: "tee_id and course_id are required" }, { status: 400 });

  const admin = v2AdminClient();
  const { count } = await admin.from("v2_course_tees").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  if ((count || 0) <= 1) return NextResponse.json({ error: "Cannot delete the last tee box" }, { status: 400 });

  await admin.from("v2_course_holes").delete().eq("tee_id", teeId);
  const { error } = await admin.from("v2_course_tees").delete().eq("id", teeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await stamp(admin, courseId, userId);
  return NextResponse.json({ success: true });
}
