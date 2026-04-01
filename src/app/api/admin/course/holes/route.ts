import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// PUT - Batch update hole data (par, handicap, yards)
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { holes } = body;

    if (!holes || !Array.isArray(holes)) {
      return NextResponse.json(
        { error: "holes array is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    for (const hole of holes) {
      const { id, par, handicap_index, yards } = hole;
      if (!id) continue;

      const { error } = await adminClient
        .from("course_holes")
        .update({
          par: par ?? 4,
          handicap_index: handicap_index ?? 1,
          yards: yards ?? 0,
        })
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update holes error:", error);
    return NextResponse.json(
      { error: "Failed to update holes" },
      { status: 500 }
    );
  }
}
