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

    // Verify user is a member of this foursome (via pair membership)
    const { data: foursome } = await adminClient
      .from("ryder_cup_foursomes")
      .select("pair_team1_id, pair_team2_id")
      .eq("id", foursome_id)
      .single();

    if (!foursome) {
      return NextResponse.json({ error: "Foursome not found" }, { status: 404 });
    }

    const { data: pairs } = await adminClient
      .from("ryder_cup_pairs")
      .select("player_a_id, player_b_id")
      .in("id", [foursome.pair_team1_id, foursome.pair_team2_id]);

    const playerIds = new Set<string>();
    for (const p of pairs || []) {
      if (p.player_a_id) playerIds.add(p.player_a_id);
      if (p.player_b_id) playerIds.add(p.player_b_id);
    }

    if (!playerIds.has(user.id)) {
      return NextResponse.json(
        { error: "Not a member of this foursome" },
        { status: 403 }
      );
    }

    // Check if scoring is closed for this contest
    const { data: contestCheck } = await adminClient
      .from("ryder_cup_foursomes")
      .select("contest:contests(scoring_closed_at)")
      .eq("id", foursome_id)
      .single();

    const contestData = contestCheck?.contest
      ? (Array.isArray(contestCheck.contest) ? contestCheck.contest[0] : contestCheck.contest)
      : null;
    if (contestData?.scoring_closed_at) {
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
