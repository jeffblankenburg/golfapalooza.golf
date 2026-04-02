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
    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("BSPITW leaderboard error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compute leaderboard" },
      { status: 500 }
    );
  }
}
