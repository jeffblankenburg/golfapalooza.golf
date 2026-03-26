import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;

  return user;
}

// POST - Add a new tee box with 18 holes, or duplicate an existing one
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { course_id, tee_name, course_rating, slope_rating, par, duplicate_from } = body;

    if (!course_id || !tee_name) {
      return NextResponse.json(
        { error: "course_id and tee_name are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // If duplicating, fetch source tee info for defaults
    let sourceRating = course_rating || 72.0;
    let sourceSlope = slope_rating || 113;
    let sourcePar = par || 72;

    if (duplicate_from) {
      const { data: sourceTee } = await adminClient
        .from("course_tees")
        .select("course_rating, slope_rating, par")
        .eq("id", duplicate_from)
        .single();

      if (sourceTee) {
        sourceRating = sourceTee.course_rating;
        sourceSlope = sourceTee.slope_rating;
        sourcePar = sourceTee.par;
      }
    }

    // Create tee
    const { data: tee, error: teeError } = await adminClient
      .from("course_tees")
      .insert({
        course_id,
        tee_name,
        course_rating: sourceRating,
        slope_rating: sourceSlope,
        par: sourcePar,
      })
      .select()
      .single();

    if (teeError) {
      return NextResponse.json({ error: teeError.message }, { status: 500 });
    }

    // Get source holes — either from duplicate_from or from the first existing tee
    let sourceHoles: { hole_number: number; par: number; handicap_index: number; yards: number; overhead_image_url: string | null; green_image_url: string | null }[] = [];

    const sourceTeeId = duplicate_from;
    if (sourceTeeId) {
      const { data } = await adminClient
        .from("course_holes")
        .select("hole_number, par, handicap_index, yards, overhead_image_url, green_image_url")
        .eq("tee_id", sourceTeeId)
        .order("hole_number");

      if (data) sourceHoles = data;
    } else {
      // Existing behavior: copy pars/handicaps from first tee
      const { data: existingTees } = await adminClient
        .from("course_tees")
        .select("id")
        .eq("course_id", course_id)
        .neq("id", tee.id)
        .limit(1);

      if (existingTees && existingTees.length > 0) {
        const { data } = await adminClient
          .from("course_holes")
          .select("hole_number, par, handicap_index, yards, overhead_image_url, green_image_url")
          .eq("tee_id", existingTees[0].id)
          .order("hole_number");

        if (data) sourceHoles = data;
      }
    }

    // Create 18 holes for the new tee
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

    const { error: holesError } = await adminClient
      .from("course_holes")
      .insert(holesData);

    if (holesError) {
      return NextResponse.json({ error: holesError.message }, { status: 500 });
    }

    return NextResponse.json({ tee });
  } catch (error) {
    console.error("Create tee error:", error);
    return NextResponse.json(
      { error: "Failed to create tee" },
      { status: 500 }
    );
  }
}

// PUT - Update tee info
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { tee_id, tee_name, course_rating, slope_rating, par } = body;

    if (!tee_id) {
      return NextResponse.json(
        { error: "tee_id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("course_tees")
      .update({
        tee_name: tee_name || "White",
        course_rating: course_rating || 72.0,
        slope_rating: slope_rating || 113,
        par: par || 72,
      })
      .eq("id", tee_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update tee error:", error);
    return NextResponse.json(
      { error: "Failed to update tee" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a tee and its holes
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const teeId = searchParams.get("tee_id");
    const courseId = searchParams.get("course_id");

    if (!teeId || !courseId) {
      return NextResponse.json(
        { error: "tee_id and course_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Prevent deleting the last tee
    const { count } = await adminClient
      .from("course_tees")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId);

    if ((count || 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last tee box" },
        { status: 400 }
      );
    }

    // Delete holes first (FK constraint)
    await adminClient.from("course_holes").delete().eq("tee_id", teeId);

    // Delete tee
    const { error } = await adminClient
      .from("course_tees")
      .delete()
      .eq("id", teeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete tee error:", error);
    return NextResponse.json(
      { error: "Failed to delete tee" },
      { status: 500 }
    );
  }
}
