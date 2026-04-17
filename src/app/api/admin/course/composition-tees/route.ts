import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// GET - Get composition mappings for a tee
export async function GET(request: NextRequest) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teeId = request.nextUrl.searchParams.get("tee_id");
  if (!teeId) {
    return NextResponse.json({ error: "tee_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data, error }, { data: allComposition }] = await Promise.all([
    admin
      .from("composition_tee_mappings")
      .select("hole_number, source_tee_id")
      .eq("tee_id", teeId)
      .order("hole_number"),
    // Return distinct tee IDs that are composition tees (have any mappings)
    admin
      .from("composition_tee_mappings")
      .select("tee_id")
      .neq("tee_id", teeId),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const compositionTeeIds = [...new Set((allComposition || []).map((r) => r.tee_id))];

  return NextResponse.json({ mappings: data || [], compositionTeeIds });
}

// POST - Save composition mappings (upsert all 18 holes)
export async function POST(request: NextRequest) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tee_id, mappings } = await request.json();

  if (!tee_id || !mappings || !Array.isArray(mappings)) {
    return NextResponse.json({ error: "tee_id and mappings array required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const rows = mappings.map((m: { hole_number: number; source_tee_id: string }) => ({
    tee_id,
    hole_number: m.hole_number,
    source_tee_id: m.source_tee_id,
  }));

  const { error } = await admin
    .from("composition_tee_mappings")
    .upsert(rows, { onConflict: "tee_id,hole_number" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE - Remove all composition mappings for a tee (makes it a regular tee again)
export async function DELETE(request: NextRequest) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tee_id } = await request.json();
  if (!tee_id) {
    return NextResponse.json({ error: "tee_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("composition_tee_mappings")
    .delete()
    .eq("tee_id", tee_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
