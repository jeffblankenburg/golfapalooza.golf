import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// PUT - Batch upsert bonus points
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { bonuses } = await request.json();

    if (!bonuses || !Array.isArray(bonuses) || bonuses.length === 0) {
      return NextResponse.json({ error: "bonuses array is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // For any entry with holed_out: true, clear holed_out on all other players for that (team_id, hole_number)
    for (const b of bonuses as { team_id: string; hole_number: number; user_id: string; holed_out: boolean }[]) {
      if (b.holed_out) {
        await adminClient
          .from("bspitw_bonus_points")
          .update({ holed_out: false })
          .eq("team_id", b.team_id)
          .eq("hole_number", b.hole_number)
          .neq("user_id", b.user_id);
      }
    }

    // Upsert all bonus entries
    const { error: upsertError } = await adminClient
      .from("bspitw_bonus_points")
      .upsert(
        bonuses.map((b: { team_id: string; hole_number: number; user_id: string; on_green: boolean; holed_out: boolean }) => ({
          team_id: b.team_id,
          hole_number: b.hole_number,
          user_id: b.user_id,
          on_green: b.on_green,
          holed_out: b.holed_out,
        })),
        { onConflict: "team_id,hole_number,user_id" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update bonus points error:", error);
    return NextResponse.json({ error: "Failed to save bonus points" }, { status: 500 });
  }
}
