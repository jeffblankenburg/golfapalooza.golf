import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// PUT - Update hole GPS coordinates
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { hole_id, tee_latitude, tee_longitude, green_latitude, green_longitude, drive_latitude, drive_longitude } =
      await request.json();

    if (!hole_id) {
      return NextResponse.json({ error: "hole_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("course_holes")
      .update({
        tee_latitude: tee_latitude ?? null,
        tee_longitude: tee_longitude ?? null,
        green_latitude: green_latitude ?? null,
        green_longitude: green_longitude ?? null,
        drive_latitude: drive_latitude ?? null,
        drive_longitude: drive_longitude ?? null,
      })
      .eq("id", hole_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save coordinates" }, { status: 500 });
  }
}
