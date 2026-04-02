import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeBspitwLeaderboard } from "@/lib/winners/bspitw-scoring";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  try {
    const leaderboard = await computeBspitwLeaderboard(supabase, tripId);

    // Check if BSPITW winners have been resolved
    let finalized = false;
    let winnerId: string | null = null;
    const { data: calcuttaContest } = await supabase
      .from("contests")
      .select("id")
      .eq("trip_id", tripId)
      .eq("contest_type", "calcutta")
      .single();

    if (calcuttaContest) {
      const { data: bspitwPrizes } = await supabase
        .from("calcutta_prizes")
        .select("id")
        .eq("contest_id", calcuttaContest.id)
        .in("resolution_type", ["bspitw", "other"]);

      if (bspitwPrizes && bspitwPrizes.length > 0) {
        const { data: winners } = await supabase
          .from("contest_winners")
          .select("id, user_id")
          .in("prize_id", bspitwPrizes.map((p) => p.id))
          .limit(1);

        finalized = (winners?.length || 0) > 0;
        if (winners?.[0]?.user_id) {
          winnerId = winners[0].user_id;
        }
      }
    }

    return NextResponse.json({ leaderboard, finalized, winnerId });
  } catch (error) {
    console.error("BSPITW leaderboard error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute leaderboard" },
      { status: 500 }
    );
  }
}
