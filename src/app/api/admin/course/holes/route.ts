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

    const results = await Promise.all(
      holes
        .filter((hole: { id?: string }) => hole.id)
        .map((hole: { id: string; par?: number; handicap_index?: number; yards?: number }) =>
          adminClient
            .from("course_holes")
            .update({
              par: hole.par ?? 4,
              handicap_index: hole.handicap_index ?? 1,
              yards: hole.yards ?? 0,
            })
            .eq("id", hole.id)
        )
    );

    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
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
