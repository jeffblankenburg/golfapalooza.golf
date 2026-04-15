import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// PUT - Update hole GPS coordinates
// Tee position is per-tee-box. Green, drive, and green front/back are shared
// across all tee boxes for the same hole number on the same course.
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      hole_id,
      tee_latitude, tee_longitude,
      green_latitude, green_longitude,
      drive_latitude, drive_longitude,
      green_front_latitude, green_front_longitude,
      green_back_latitude, green_back_longitude,
    } = await request.json();

    if (!hole_id) {
      return NextResponse.json({ error: "hole_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Update tee position on this specific hole (per-tee-box)
    const teeUpdate: Record<string, unknown> = {};
    if (tee_latitude !== undefined) teeUpdate.tee_latitude = tee_latitude ?? null;
    if (tee_longitude !== undefined) teeUpdate.tee_longitude = tee_longitude ?? null;

    // Shared fields: green, drive, green front/back — apply to ALL tee boxes for this hole
    const sharedUpdate: Record<string, unknown> = {};
    if (green_latitude !== undefined) sharedUpdate.green_latitude = green_latitude ?? null;
    if (green_longitude !== undefined) sharedUpdate.green_longitude = green_longitude ?? null;
    if (drive_latitude !== undefined) sharedUpdate.drive_latitude = drive_latitude ?? null;
    if (drive_longitude !== undefined) sharedUpdate.drive_longitude = drive_longitude ?? null;
    if (green_front_latitude !== undefined) sharedUpdate.green_front_latitude = green_front_latitude ?? null;
    if (green_front_longitude !== undefined) sharedUpdate.green_front_longitude = green_front_longitude ?? null;
    if (green_back_latitude !== undefined) sharedUpdate.green_back_latitude = green_back_latitude ?? null;
    if (green_back_longitude !== undefined) sharedUpdate.green_back_longitude = green_back_longitude ?? null;

    // Always update tee on this specific hole
    const { error: teeError } = await adminClient
      .from("course_holes")
      .update({ ...teeUpdate, ...sharedUpdate })
      .eq("id", hole_id);

    if (teeError) {
      return NextResponse.json({ error: teeError.message }, { status: 500 });
    }

    // Propagate shared fields to other tee boxes for the same hole number
    if (Object.keys(sharedUpdate).length > 0) {
      // Look up this hole's course and hole_number
      const { data: thisHole } = await adminClient
        .from("course_holes")
        .select("hole_number, tee_id")
        .eq("id", hole_id)
        .single();

      if (thisHole) {
        // Find the course_id from the tee
        const { data: thisTee } = await adminClient
          .from("course_tees")
          .select("course_id")
          .eq("id", thisHole.tee_id)
          .single();

        if (thisTee) {
          // Get all tee IDs for this course
          const { data: allTees } = await adminClient
            .from("course_tees")
            .select("id")
            .eq("course_id", thisTee.course_id);

          const allTeeIds = (allTees || []).map((t) => t.id);

          // Update all other holes with the same hole_number across all tees
          if (allTeeIds.length > 1) {
            await adminClient
              .from("course_holes")
              .update(sharedUpdate)
              .in("tee_id", allTeeIds)
              .eq("hole_number", thisHole.hole_number)
              .neq("id", hole_id);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save coordinates" }, { status: 500 });
  }
}
