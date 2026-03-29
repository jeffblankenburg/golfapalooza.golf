import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data: scores, error } = await supabase
    .from("hundred_feet_scores")
    .select("user_id, day_number, feet, inches, user:users(display_name, avatar_url)")
    .eq("trip_id", tripId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by user, calculate totals
  const playerMap: Record<string, {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    days: Record<number, { feet: number; inches: number }>;
    totalInches: number;
  }> = {};

  for (const s of scores || []) {
    const u = Array.isArray(s.user) ? s.user[0] : s.user;
    if (!playerMap[s.user_id]) {
      playerMap[s.user_id] = {
        user_id: s.user_id,
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
        days: {},
        totalInches: 0,
      };
    }
    playerMap[s.user_id].days[s.day_number] = { feet: s.feet, inches: s.inches };
    playerMap[s.user_id].totalInches += s.feet * 12 + s.inches;
  }

  // Sort by total inches ascending (lower = better)
  const leaderboard = Object.values(playerMap).sort((a, b) => a.totalInches - b.totalInches);

  return NextResponse.json({ leaderboard });
}
