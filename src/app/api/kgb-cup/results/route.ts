import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  computeFoursomeResult,
  computeOverallResults,
  type FoursomeData,
  type HoleScore,
  type HoleInfo,
} from "@/lib/kgb-cup/match-logic";
import { deriveFoursomes } from "@/lib/kgb-cup/derive-foursomes";

// GET - User-facing KGB Cup results (authenticated, not admin-only)
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    // Fetch teams
    const { data: teams } = await supabase
      .from("ryder_cup_teams")
      .select("id, contest_id, team_number, team_name, team_color")
      .eq("contest_id", contestId)
      .order("team_number");

    if (!teams || teams.length === 0) {
      return NextResponse.json({ error: "No teams found" }, { status: 404 });
    }

    const teamIds = teams.map((t) => t.id);

    // Fetch pairs with player info
    const { data: pairs } = await supabase
      .from("ryder_cup_pairs")
      .select(
        "id, team_id, player_a_id, player_b_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name)"
      )
      .in("team_id", teamIds)
      .order("sort_order");

    // Build pair lookup
    const pairMap = new Map<
      string,
      {
        id: string;
        team_id: string;
        player_a_id: string | null;
        player_b_id: string | null;
        player_a_name: string;
        player_b_name: string;
      }
    >();
    for (const p of pairs || []) {
      const playerA = Array.isArray(p.player_a) ? p.player_a[0] : p.player_a;
      const playerB = Array.isArray(p.player_b) ? p.player_b[0] : p.player_b;
      pairMap.set(p.id, {
        id: p.id,
        team_id: p.team_id,
        player_a_id: p.player_a_id,
        player_b_id: p.player_b_id,
        player_a_name: playerA?.display_name || "TBD",
        player_b_name: playerB?.display_name || "",
      });
    }

    // Derive foursomes from pairs
    const foursomes = deriveFoursomes(
      (pairs || []).map((p) => ({ id: p.id, team_id: p.team_id, sort_order: p.sort_order })),
      teams || []
    );

    // Fetch scores
    const foursomeIds = foursomes.map((f) => f.id);
    let scores: HoleScore[] = [];
    if (foursomeIds.length > 0) {
      const { data: scoreData } = await supabase
        .from("kgb_cup_hole_scores")
        .select("foursome_id, hole_number, scorer_type, scorer_id, strokes")
        .in("foursome_id", foursomeIds);
      scores = (scoreData || []) as HoleScore[];
    }

    // Fetch base handicaps from player_handicaps table
    const allPlayerIds: string[] = [];
    for (const p of pairMap.values()) {
      if (p.player_a_id) allPlayerIds.push(p.player_a_id);
      if (p.player_b_id) allPlayerIds.push(p.player_b_id);
    }

    const { data: baseHandicapData } = allPlayerIds.length > 0
      ? await supabase
          .from("player_handicaps")
          .select("user_id, handicap_index")
          .in("user_id", allPlayerIds)
      : { data: [] };

    const baseHandicaps = new Map<string, number>();
    for (const bh of baseHandicapData || []) {
      baseHandicaps.set(bh.user_id, bh.handicap_index);
    }

    // Compute per-foursome adjusted handicaps (subtract lowest in each foursome)
    const playerHandicaps = new Map<string, number>();
    for (const f of foursomes) {
      const pair1 = pairMap.get(f.pair_team1_id);
      const pair2 = pairMap.get(f.pair_team2_id);
      const playerIds = [pair1?.player_a_id, pair1?.player_b_id, pair2?.player_a_id, pair2?.player_b_id].filter(Boolean) as string[];
      const handicaps = playerIds.map((id) => baseHandicaps.get(id) ?? 0);
      const lowest = Math.min(...handicaps);
      for (let i = 0; i < playerIds.length; i++) {
        playerHandicaps.set(playerIds[i], Math.round(handicaps[i] - lowest));
      }
    }

    // Fetch pair handicaps
    const { data: pairHandicapData } = await supabase
      .from("kgb_cup_pair_handicaps")
      .select("pair_id, scramble_handicap")
      .eq("contest_id", contestId);

    const pairHandicaps = new Map<string, number>();
    for (const ph of pairHandicapData || []) {
      pairHandicaps.set(ph.pair_id, ph.scramble_handicap);
    }

    // Fetch hole info
    const { data: contest } = await supabase
      .from("contests")
      .select("trip_id")
      .eq("id", contestId)
      .single();

    let holes: HoleInfo[] = [];
    if (contest) {
      const { data: trip } = await supabase
        .from("trip_settings")
        .select("course_id")
        .eq("id", contest.trip_id)
        .single();

      if (trip?.course_id) {
        const { data: teeAssignments } = await supabase
          .from("contest_hole_tees")
          .select("hole_number, tee_id")
          .eq("contest_id", contestId)
          .order("hole_number");

        if (teeAssignments && teeAssignments.length > 0) {
          const { data: courseHoles } = await supabase
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

    // Build foursome data and compute results
    const foursomeDataList: FoursomeData[] = (foursomes || []).map((f) => {
      const pair1 = pairMap.get(f.pair_team1_id);
      const pair2 = pairMap.get(f.pair_team2_id);
      return {
        id: f.id,
        pair_team1_id: f.pair_team1_id,
        pair_team2_id: f.pair_team2_id,
        team1_player_a_id: pair1?.player_a_id || null,
        team1_player_b_id: pair1?.player_b_id || null,
        team2_player_a_id: pair2?.player_a_id || null,
        team2_player_b_id: pair2?.player_b_id || null,
      };
    });

    // Build playerNames map from pair data
    const playerNames = new Map<string, string>();
    for (const p of pairMap.values()) {
      if (p.player_a_id) playerNames.set(p.player_a_id, p.player_a_name);
      if (p.player_b_id) playerNames.set(p.player_b_id, p.player_b_name);
    }

    const foursomeResults = foursomeDataList.map((fd) =>
      computeFoursomeResult(fd, scores, playerHandicaps, pairHandicaps, holes, playerNames)
    );

    const overall = computeOverallResults(foursomeResults);

    // Build enriched response with player names
    const enrichedFoursomes = (foursomes || []).map((f, i) => {
      const pair1 = pairMap.get(f.pair_team1_id);
      const pair2 = pairMap.get(f.pair_team2_id);
      return {
        id: f.id,
        sort_order: f.sort_order,
        team1_pair: pair1
          ? { id: pair1.id, player_a: pair1.player_a_name, player_b: pair1.player_b_name }
          : null,
        team2_pair: pair2
          ? { id: pair2.id, player_a: pair2.player_a_name, player_b: pair2.player_b_name }
          : null,
        results: foursomeResults[i],
      };
    });

    // Fetch contest lifecycle status
    const { data: contestStatus } = await supabase
      .from("contests")
      .select("verified_at")
      .eq("id", contestId)
      .single();

    return NextResponse.json({
      teams: teams.map((t) => ({ id: t.id, team_number: t.team_number, team_name: t.team_name, team_color: t.team_color })),
      foursomes: enrichedFoursomes,
      overall,
      holes,
      verified: !!contestStatus?.verified_at,
    });
  } catch (error) {
    console.error("Get KGB Cup results error:", error);
    return NextResponse.json({ error: "Failed to load results" }, { status: 500 });
  }
}
