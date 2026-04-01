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

// POST - Reset all scramble data for a trip
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

    // Delete in order of dependencies:
    // 1. Hole scores (FK to teams)
    // 2. Team members (FK to teams)
    // 3. Teams (FK to contests)
    // 4. Tee assignments
    // 5. Participants

    for (const contestId of contestIds) {
      // Scramble teams cascade: deleting teams will cascade to team_members and hole_scores
      await adminClient
        .from("scramble_teams")
        .delete()
        .eq("contest_id", contestId);

      // Clear tee assignments
      await adminClient
        .from("contest_hole_tees")
        .delete()
        .eq("contest_id", contestId);

      // Clear participants
      await adminClient
        .from("contest_participants")
        .delete()
        .eq("contest_id", contestId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset scrambles error:", error);
    return NextResponse.json({ error: "Failed to reset" }, { status: 500 });
  }
}
