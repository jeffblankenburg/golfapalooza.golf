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

// POST - Create a foursome
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, pair_team1_id, pair_team2_id } = await request.json();

    if (!contest_id || !pair_team1_id || !pair_team2_id) {
      return NextResponse.json(
        { error: "contest_id, pair_team1_id, and pair_team2_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Validate pairs belong to correct teams
    const { data: teams } = await adminClient
      .from("ryder_cup_teams")
      .select("id, team_number")
      .eq("contest_id", contest_id);

    if (!teams || teams.length !== 2) {
      return NextResponse.json({ error: "Contest must have exactly 2 teams" }, { status: 400 });
    }

    const team1 = teams.find((t) => t.team_number === 1);
    const team2 = teams.find((t) => t.team_number === 2);

    if (!team1 || !team2) {
      return NextResponse.json({ error: "Missing team 1 or team 2" }, { status: 400 });
    }

    // Verify pair_team1_id belongs to team 1
    const { data: pair1 } = await adminClient
      .from("ryder_cup_pairs")
      .select("id, team_id")
      .eq("id", pair_team1_id)
      .single();

    if (!pair1 || pair1.team_id !== team1.id) {
      return NextResponse.json({ error: "pair_team1_id must belong to Team 1" }, { status: 400 });
    }

    // Verify pair_team2_id belongs to team 2
    const { data: pair2 } = await adminClient
      .from("ryder_cup_pairs")
      .select("id, team_id")
      .eq("id", pair_team2_id)
      .single();

    if (!pair2 || pair2.team_id !== team2.id) {
      return NextResponse.json({ error: "pair_team2_id must belong to Team 2" }, { status: 400 });
    }

    // Check pairs not already in a foursome
    const { data: existingFoursomes } = await adminClient
      .from("ryder_cup_foursomes")
      .select("id, pair_team1_id, pair_team2_id")
      .eq("contest_id", contest_id);

    for (const f of existingFoursomes || []) {
      if (f.pair_team1_id === pair_team1_id || f.pair_team2_id === pair_team2_id) {
        return NextResponse.json(
          { error: "One of the selected pairs is already in a foursome" },
          { status: 400 }
        );
      }
    }

    // Get next sort_order
    const nextOrder = (existingFoursomes?.length ?? 0);

    const { data: foursome, error } = await adminClient
      .from("ryder_cup_foursomes")
      .insert({
        contest_id,
        pair_team1_id,
        pair_team2_id,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ foursome });
  } catch (error) {
    console.error("Create ryder cup foursome error:", error);
    return NextResponse.json({ error: "Failed to create foursome" }, { status: 500 });
  }
}

// DELETE - Delete a foursome
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { foursome_id } = await request.json();

    if (!foursome_id) {
      return NextResponse.json({ error: "foursome_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("ryder_cup_foursomes")
      .delete()
      .eq("id", foursome_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete ryder cup foursome error:", error);
    return NextResponse.json({ error: "Failed to delete foursome" }, { status: 500 });
  }
}
