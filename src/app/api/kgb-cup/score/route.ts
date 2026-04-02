import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { foursome_id, hole_number, scorer_type, scorer_id, strokes } =
      await request.json();

    if (!foursome_id || !hole_number || !scorer_type || !scorer_id || strokes == null) {
      return NextResponse.json(
        { error: "foursome_id, hole_number, scorer_type, scorer_id, and strokes are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // foursome_id = team1 pair ID. Verify user is a member of this foursome.
    // Find the pair (team1) and its matching pair (team2, same sort_order).
    const { data: team1Pair } = await adminClient
      .from("ryder_cup_pairs")
      .select("id, team_id, sort_order, player_a_id, player_b_id")
      .eq("id", foursome_id)
      .single();

    if (!team1Pair) {
      return NextResponse.json({ error: "Foursome not found" }, { status: 404 });
    }

    // Find the opposing team's pair with the same sort_order
    const { data: team1Info } = await adminClient
      .from("ryder_cup_teams")
      .select("id, contest_id")
      .eq("id", team1Pair.team_id)
      .single();

    if (!team1Info) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    const { data: team2 } = await adminClient
      .from("ryder_cup_teams")
      .select("id")
      .eq("contest_id", team1Info.contest_id)
      .neq("id", team1Info.id)
      .single();

    const { data: team2Pair } = team2
      ? await adminClient
          .from("ryder_cup_pairs")
          .select("player_a_id, player_b_id")
          .eq("team_id", team2.id)
          .eq("sort_order", team1Pair.sort_order)
          .single()
      : { data: null };

    const playerIds = new Set<string>();
    if (team1Pair.player_a_id) playerIds.add(team1Pair.player_a_id);
    if (team1Pair.player_b_id) playerIds.add(team1Pair.player_b_id);
    if (team2Pair?.player_a_id) playerIds.add(team2Pair.player_a_id);
    if (team2Pair?.player_b_id) playerIds.add(team2Pair.player_b_id);

    if (!playerIds.has(user.id)) {
      return NextResponse.json(
        { error: "Not a member of this foursome" },
        { status: 403 }
      );
    }

    // Check if scoring is closed for this contest
    const { data: contestCheck } = await adminClient
      .from("contests")
      .select("scoring_closed_at")
      .eq("id", team1Info.contest_id)
      .single();

    if (contestCheck?.scoring_closed_at) {
      return NextResponse.json(
        { error: "Scoring is closed" },
        { status: 403 }
      );
    }

    // Upsert score via authenticated client (RLS applies)
    const { error: upsertError } = await supabase
      .from("kgb_cup_hole_scores")
      .upsert(
        { foursome_id, hole_number, scorer_type, scorer_id, strokes },
        { onConflict: "foursome_id,hole_number,scorer_type,scorer_id" }
      );

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save KGB Cup score error:", error);
    return NextResponse.json(
      { error: "Failed to save score" },
      { status: 500 }
    );
  }
}
