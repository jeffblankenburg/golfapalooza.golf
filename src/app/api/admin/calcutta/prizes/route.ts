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
    const { id, contest_id, linked_contest_id, place, percentage, sort_order, per_player, player_count } = await request.json();

    if (!contest_id || !linked_contest_id || percentage == null) {
      return NextResponse.json({ error: "contest_id, linked_contest_id, and percentage are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const row = {
      linked_contest_id,
      place: place || 1,
      percentage,
      sort_order: sort_order || 0,
      per_player: per_player || false,
      player_count: per_player ? (player_count || 1) : 1,
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
