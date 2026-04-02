import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// POST - Create or update a prize entry
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_calcutta");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, contest_id, linked_contest_id, place, percentage, sort_order, per_player, player_count, resolution_type, prize_name } = await request.json();

    if (!contest_id || percentage == null) {
      return NextResponse.json({ error: "contest_id and percentage are required" }, { status: 400 });
    }

    // linked_contest_id is required unless resolution_type is 'bspitw'
    if (!linked_contest_id && resolution_type !== "bspitw") {
      return NextResponse.json({ error: "linked_contest_id is required (unless resolution_type is 'bspitw')" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Auto-derive resolution_type from linked contest's type if not explicitly set
    let derivedResolutionType = resolution_type || null;
    if (!derivedResolutionType && linked_contest_id) {
      const { data: linkedContest } = await adminClient
        .from("contests")
        .select("contest_type")
        .eq("id", linked_contest_id)
        .single();
      if (linkedContest?.contest_type) {
        derivedResolutionType = linkedContest.contest_type;
      }
    }

    const row = {
      linked_contest_id: linked_contest_id || null,
      place: place || 1,
      percentage,
      sort_order: sort_order || 0,
      per_player: per_player || false,
      player_count: per_player ? (player_count || 1) : 1,
      resolution_type: derivedResolutionType,
      prize_name: prize_name || null,
    };

    if (id) {
      // Update existing
      const { error } = await adminClient
        .from("calcutta_prizes")
        .update(row)
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    } else {
      // Insert new
      const { data, error } = await adminClient
        .from("calcutta_prizes")
        .insert({ contest_id, ...row })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ prize: data });
    }
  } catch (error) {
    console.error("Create/update calcutta prize error:", error);
    return NextResponse.json({ error: "Failed to save prize" }, { status: 500 });
  }
}

// DELETE - Remove a prize entry
export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_calcutta");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Prize id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("calcutta_prizes")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete calcutta prize error:", error);
    return NextResponse.json({ error: "Failed to delete prize" }, { status: 500 });
  }
}
