import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// POST - Reset all scramble data for a trip back to a clean slate
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id } = await request.json();

    if (!trip_id) {
      return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get all scramble contest IDs for this trip
    const { data: contests } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip_id)
      .eq("contest_type", "scramble");

    const contestIds = (contests || []).map((c) => c.id);

    if (contestIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    // 1. Clear contest winners for prizes linked to these scramble contests
    const { data: linkedPrizes } = await adminClient
      .from("calcutta_prizes")
      .select("id")
      .in("linked_contest_id", contestIds);

    if (linkedPrizes && linkedPrizes.length > 0) {
      const prizeIds = linkedPrizes.map((p) => p.id);
      await adminClient
        .from("contest_winners")
        .delete()
        .in("prize_id", prizeIds);
    }

    // 2. Clear BSPITW winners (linked to calcutta, not directly to scramble contests)
    const { data: calcuttaContest } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip_id)
      .eq("contest_type", "calcutta")
      .single();

    if (calcuttaContest) {
      const { data: bspitwPrizes } = await adminClient
        .from("calcutta_prizes")
        .select("id")
        .eq("contest_id", calcuttaContest.id)
        .in("resolution_type", ["bspitw", "other"]);

      if (bspitwPrizes && bspitwPrizes.length > 0) {
        await adminClient
          .from("contest_winners")
          .delete()
          .in("prize_id", bspitwPrizes.map((p) => p.id));
      }
    }

    // 3. Delete scramble data per contest (cascades handle child tables:
    //    scramble_teams -> scramble_team_members, scramble_hole_scores, bspitw_bonus_points)
    for (const contestId of contestIds) {
      await adminClient
        .from("scramble_teams")
        .delete()
        .eq("contest_id", contestId);

      await adminClient
        .from("contest_hole_tees")
        .delete()
        .eq("contest_id", contestId);

      await adminClient
        .from("contest_participants")
        .delete()
        .eq("contest_id", contestId);
    }

    // 4. Reset contest flags back to clean state
    await adminClient
      .from("contests")
      .update({
        verified_at: null,
        verified_by: null,
        scoring_closed_at: null,
        winners_locked_at: null,
        winners_locked_by: null,
      })
      .in("id", contestIds);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset scrambles error:", error);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
