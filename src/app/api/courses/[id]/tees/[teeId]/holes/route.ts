import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveHolesForTee } from "@/lib/golf/composition-tees";

// GET - Get holes for a specific tee (handles composition tees transparently)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; teeId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teeId } = await params;

  const { data: holes, error } = await resolveHolesForTee(supabase, teeId, "*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ holes: holes || [] });
}

// PUT - Bulk update holes for a tee
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; teeId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId, teeId } = await params;

  try {
    const body = await request.json();
    const { holes } = body as {
      holes: { hole_number: number; par: number; handicap_index: number; yards?: number | null }[];
    };

    if (!holes || !Array.isArray(holes)) {
      return NextResponse.json({ error: "holes array is required" }, { status: 400 });
    }

    // Batch upsert all holes at once
    const rows = holes.map((hole) => ({
      course_id: courseId,
      tee_id: teeId,
      hole_number: hole.hole_number,
      par: hole.par,
      handicap_index: hole.handicap_index,
      yards: hole.yards || null,
    }));

    const { error: upsertError } = await supabase
      .from("course_holes")
      .upsert(rows, { onConflict: "tee_id,hole_number" });

    if (upsertError) {
      console.error("Holes upsert error:", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update holes" }, { status: 500 });
  }
}
