import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkCourseEditAccess, stampCourseEdit } from "@/lib/courses/edit-access";

/**
 * Issue #133. GPS-coordinate editor for a hole. Tee location lives per
 * (tee, hole); green center / drive / green front / back / center_line are
 * shared across every tee on the same hole and get propagated.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  let body: {
    hole_id?: string;
    tee_latitude?: number | null;
    tee_longitude?: number | null;
    green_latitude?: number | null;
    green_longitude?: number | null;
    drive_latitude?: number | null;
    drive_longitude?: number | null;
    green_front_latitude?: number | null;
    green_front_longitude?: number | null;
    green_back_latitude?: number | null;
    green_back_longitude?: number | null;
    center_line?: number[][] | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    hole_id,
    tee_latitude, tee_longitude,
    green_latitude, green_longitude,
    drive_latitude, drive_longitude,
    green_front_latitude, green_front_longitude,
    green_back_latitude, green_back_longitude,
    center_line,
  } = body;

  if (!hole_id) {
    return NextResponse.json({ error: "hole_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up the row so we can (a) check edit access against its course,
  // (b) get hole_number + tee_id for propagating shared fields.
  const { data: row } = await admin
    .from("course_holes")
    .select("id, course_id, hole_number, tee_id")
    .eq("id", hole_id)
    .maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "Hole not found" }, { status: 404 });
  }

  const access = await checkCourseEditAccess(row.course_id);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const teeUpdate: Record<string, unknown> = {};
  if (tee_latitude !== undefined) teeUpdate.tee_latitude = tee_latitude ?? null;
  if (tee_longitude !== undefined) teeUpdate.tee_longitude = tee_longitude ?? null;

  const sharedUpdate: Record<string, unknown> = {};
  if (green_latitude !== undefined) sharedUpdate.green_latitude = green_latitude ?? null;
  if (green_longitude !== undefined) sharedUpdate.green_longitude = green_longitude ?? null;
  if (drive_latitude !== undefined) sharedUpdate.drive_latitude = drive_latitude ?? null;
  if (drive_longitude !== undefined) sharedUpdate.drive_longitude = drive_longitude ?? null;
  if (green_front_latitude !== undefined) sharedUpdate.green_front_latitude = green_front_latitude ?? null;
  if (green_front_longitude !== undefined) sharedUpdate.green_front_longitude = green_front_longitude ?? null;
  if (green_back_latitude !== undefined) sharedUpdate.green_back_latitude = green_back_latitude ?? null;
  if (green_back_longitude !== undefined) sharedUpdate.green_back_longitude = green_back_longitude ?? null;
  if (center_line !== undefined) {
    sharedUpdate.center_line = Array.isArray(center_line) && center_line.length > 0 ? center_line : null;
  }

  const { error: teeError } = await admin
    .from("course_holes")
    .update({ ...teeUpdate, ...sharedUpdate })
    .eq("id", hole_id);
  if (teeError) {
    return NextResponse.json({ error: teeError.message }, { status: 500 });
  }

  // Propagate shared fields to every other tee row for the same hole_number.
  if (Object.keys(sharedUpdate).length > 0) {
    const { data: allTees } = await admin
      .from("course_tees")
      .select("id")
      .eq("course_id", row.course_id);
    const allTeeIds = (allTees || []).map((t) => t.id);
    if (allTeeIds.length > 1) {
      await admin
        .from("course_holes")
        .update(sharedUpdate)
        .in("tee_id", allTeeIds)
        .eq("hole_number", row.hole_number)
        .neq("id", hole_id);
    }
  }

  await stampCourseEdit(row.course_id, effectiveUserId);
  return NextResponse.json({ success: true });
}
