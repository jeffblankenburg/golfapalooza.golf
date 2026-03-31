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

// GET - Fetch all scoring data for a KGB Cup contest
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // Fetch foursomes with pair details
    const { data: foursomes } = await adminClient
      .from("ryder_cup_foursomes")
      .select("id, contest_id, pair_team1_id, pair_team2_id, sort_order")
      .eq("contest_id", contestId)
      .order("sort_order");

    // Fetch all pairs for this contest (via teams)
    const { data: teams } = await adminClient
      .from("ryder_cup_teams")
      .select("id, team_number, team_name")
      .eq("contest_id", contestId)
      .order("team_number");

    const teamIds = (teams || []).map((t) => t.id);

    const { data: pairs } = teamIds.length > 0
      ? await adminClient
          .from("ryder_cup_pairs")
          .select(
            "id, team_id, player_a_id, player_b_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name, full_name), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name, full_name)"
          )
          .in("team_id", teamIds)
          .order("sort_order")
      : { data: [] };

    // Normalize pairs
    const normalizedPairs = (pairs || []).map((p) => {
      const playerA = Array.isArray(p.player_a) ? p.player_a[0] : p.player_a;
      const playerB = Array.isArray(p.player_b) ? p.player_b[0] : p.player_b;
      return {
        id: p.id,
        team_id: p.team_id,
        sort_order: p.sort_order,
        player_a_id: p.player_a_id,
        player_b_id: p.player_b_id,
        player_a: playerA
          ? { id: playerA.id, display_name: playerA.display_name, full_name: playerA.full_name }
          : null,
        player_b: playerB
          ? { id: playerB.id, display_name: playerB.display_name, full_name: playerB.full_name }
          : null,
      };
    });

    // Fetch hole scores for all foursomes
    const foursomeIds = (foursomes || []).map((f) => f.id);
    let scores: { foursome_id: string; hole_number: number; scorer_type: string; scorer_id: string; strokes: number }[] = [];
    if (foursomeIds.length > 0) {
      const { data: scoreData } = await adminClient
        .from("kgb_cup_hole_scores")
        .select("foursome_id, hole_number, scorer_type, scorer_id, strokes")
        .in("foursome_id", foursomeIds);
      scores = scoreData || [];
    }

    // Fetch handicap snapshots
    const { data: playerHandicaps } = await adminClient
      .from("kgb_cup_player_handicaps")
      .select("player_id, original_handicap, adjusted_handicap")
      .eq("contest_id", contestId);

    // Fetch pair handicaps
    const { data: pairHandicaps } = await adminClient
      .from("kgb_cup_pair_handicaps")
      .select("pair_id, scramble_handicap")
      .eq("contest_id", contestId);

    // Fetch hole info (contest_hole_tees + course_holes)
    const { data: contest } = await adminClient
      .from("contests")
      .select("trip_id")
      .eq("id", contestId)
      .single();

    let holes: { hole_number: number; par: number; yards: number; handicap_index: number }[] = [];

    if (contest) {
      const { data: trip } = await adminClient
        .from("trip_settings")
        .select("course_id")
        .eq("id", contest.trip_id)
        .single();

      if (trip?.course_id) {
        const { data: teeAssignments } = await adminClient
          .from("contest_hole_tees")
          .select("hole_number, tee_id")
          .eq("contest_id", contestId)
          .order("hole_number");

        if (teeAssignments && teeAssignments.length > 0) {
          const { data: courseHoles } = await adminClient
            .from("course_holes")
            .select("tee_id, hole_number, par, yards, handicap_index")
            .eq("course_id", trip.course_id);

          if (courseHoles) {
            const holeMap = new Map<string, { par: number; yards: number; handicap_index: number }>();
            for (const h of courseHoles) {
              holeMap.set(`${h.tee_id}-${h.hole_number}`, {
                par: h.par,
                yards: h.yards || 0,
                handicap_index: h.handicap_index || 0,
              });
            }

            holes = teeAssignments.map((ta) => {
              const data = holeMap.get(`${ta.tee_id}-${ta.hole_number}`);
              return {
                hole_number: ta.hole_number,
                par: data?.par || 4,
                yards: data?.yards || 0,
                handicap_index: data?.handicap_index || 0,
              };
            });
          }
        }
      }
    }

    return NextResponse.json({
      foursomes: foursomes || [],
      pairs: normalizedPairs,
      teams: teams || [],
      scores,
      holes,
      player_handicaps: playerHandicaps || [],
      pair_handicaps: pairHandicaps || [],
    });
  } catch (error) {
    console.error("Get KGB Cup scores error:", error);
    return NextResponse.json({ error: "Failed to load scoring data" }, { status: 500 });
  }
}

// PUT - Batch upsert hole scores
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { scores } = await request.json();

    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return NextResponse.json({ error: "scores array is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error: upsertError } = await adminClient
      .from("kgb_cup_hole_scores")
      .upsert(
        scores.map(
          (s: {
            foursome_id: string;
            hole_number: number;
            scorer_type: string;
            scorer_id: string;
            strokes: number;
          }) => ({
            foursome_id: s.foursome_id,
            hole_number: s.hole_number,
            scorer_type: s.scorer_type,
            scorer_id: s.scorer_id,
            strokes: s.strokes,
          })
        ),
        { onConflict: "foursome_id,hole_number,scorer_type,scorer_id" }
      );

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update KGB Cup scores error:", error);
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }
}

// DELETE - Clear all scores for a contest's foursomes
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // Get foursome IDs for this contest
    const { data: foursomes } = await adminClient
      .from("ryder_cup_foursomes")
      .select("id")
      .eq("contest_id", contestId);

    const foursomeIds = (foursomes || []).map((f) => f.id);

    if (foursomeIds.length === 0) {
      return NextResponse.json({ success: true, cleared: 0 });
    }

    const { error } = await adminClient
      .from("kgb_cup_hole_scores")
      .delete()
      .in("foursome_id", foursomeIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cleared: foursomeIds.length });
  } catch (error) {
    console.error("Clear KGB Cup scores error:", error);
    return NextResponse.json({ error: "Failed to clear scores" }, { status: 500 });
  }
}
