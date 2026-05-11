import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// POST - Clear picks (and payouts) for a contest. The game slate and
// payment records stay intact so admin can reuse the same games without
// rebuilding them.
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Pickem_picks has a FK to pickem_games — delete picks scoped to this
    // contest's games. Games and their results stay.
    const { data: games } = await adminClient
      .from("pickem_games")
      .select("id")
      .eq("contest_id", contest_id);
    const gameIds = (games || []).map((g) => g.id as string);
    if (gameIds.length > 0) {
      await adminClient.from("pickem_picks").delete().in("game_id", gameIds);
    }

    // Clear any materialized winner rows so the standings recompute cleanly.
    await adminClient.from("contest_winners").delete().eq("contest_id", contest_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset pickem error:", error);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
