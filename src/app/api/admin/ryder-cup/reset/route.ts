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

// POST - Reset KGB Cup to empty state (preserves contest record)
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, trip_id, day_number } = await request.json();

    if (!contest_id || !trip_id || !day_number) {
      return NextResponse.json(
        { error: "contest_id, trip_id, and day_number are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 1. Delete ryder_cup_teams → cascades to pairs → foursomes → hole_scores
    const { error: teamsError } = await adminClient
      .from("ryder_cup_teams")
      .delete()
      .eq("contest_id", contest_id);

    if (teamsError) {
      console.error("Reset: failed to delete teams:", teamsError);
      return NextResponse.json({ error: teamsError.message }, { status: 500 });
    }

    // 2. Delete player handicap snapshots
    await adminClient
      .from("kgb_cup_player_handicaps")
      .delete()
      .eq("contest_id", contest_id);

    // 3. Delete pair handicap snapshots
    await adminClient
      .from("kgb_cup_pair_handicaps")
      .delete()
      .eq("contest_id", contest_id);

    // 4. Delete tee times for KGB Cup day (cascades to tee_time_players)
    await adminClient
      .from("tee_times")
      .delete()
      .eq("trip_id", trip_id)
      .eq("day_number", day_number);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset KGB Cup error:", error);
    return NextResponse.json({ error: "Failed to reset KGB Cup" }, { status: 500 });
  }
}
