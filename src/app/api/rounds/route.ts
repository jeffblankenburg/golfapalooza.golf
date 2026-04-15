import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateDifferential, calculateAdjustedGrossScore, calculateCourseHandicap } from "@/lib/golf/calculator";
import { recalculateHandicap } from "@/lib/golf/handicap";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - List user's rounds
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(user.id);

  const { data: rounds, error } = await supabase
    .from("rounds")
    .select(`
      id,
      round_date,
      round_type,
      status,
      notes,
      created_at,
      course:courses(id, name, city, state),
      tee:course_tees(id, tee_name, tee_color, course_rating, slope_rating, par),
      round_players!inner(
        id,
        user_id,
        tee_id,
        final_gross_score,
        final_adjusted_score,
        score_differential,
        player_tee:course_tees(id, tee_name, tee_color, course_rating, slope_rating, par)
      )
    `)
    .eq("round_players.user_id", userId)
    .order("round_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summaries = (rounds || []).map((r) => {
    const allPlayers = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = allPlayers.find((p) => p.user_id === userId) || allPlayers[0];
    const roundTee = Array.isArray(r.tee) ? r.tee[0] : r.tee;
    // Prefer the player's personal tee (may be a composition tee override)
    const playerTee = player?.player_tee ? (Array.isArray(player.player_tee) ? player.player_tee[0] : player.player_tee) : null;
    const tee = playerTee || roundTee;
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const par = tee?.par || 72;
    const score = player?.final_gross_score;

    return {
      id: r.id,
      round_date: r.round_date,
      round_type: r.round_type,
      status: r.status,
      course_name: course?.name || "Unknown",
      course_city: course?.city,
      course_state: course?.state,
      tee_name: tee?.tee_name || "",
      tee_color: tee?.tee_color,
      par,
      final_score: score,
      score_to_par: score != null ? score - par : null,
      score_differential: player?.score_differential,
    };
  });

  return NextResponse.json({ rounds: summaries });
}

// POST - Create a round with players and optional hole scores in one call
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(user.id);

  try {
    const body = await request.json();
    const { course_id, tee_id, round_type, round_date, players, hole_scores } = body;
    // players: array of { user_id, final_gross_score? }
    // hole_scores: optional Record<user_id, Record<hole_number, strokes>> for full scorecard

    if (!course_id || !tee_id) {
      return NextResponse.json({ error: "course_id and tee_id are required" }, { status: 400 });
    }

    const allPlayers: { user_id: string; tee_id?: string; final_gross_score?: number | null }[] =
      players && players.length > 0 ? players : [{ user_id: userId }];

    const hasHoleScores = hole_scores && Object.keys(hole_scores).length > 0;

    // If we have hole scores, compute gross totals from them
    if (hasHoleScores) {
      for (const p of allPlayers) {
        const playerHoles = hole_scores[p.user_id];
        if (playerHoles) {
          p.final_gross_score = Object.values(playerHoles).reduce((sum: number, s: unknown) => sum + (s as number), 0);
        }
      }
    }

    const isComplete = allPlayers.every((p) => p.final_gross_score != null);

    // Get all tee data needed for differential calc (round tee + any player overrides)
    const allTeeIds = [...new Set([tee_id, ...allPlayers.map((p) => p.tee_id).filter(Boolean)])];
    const { data: teesData } = await supabase
      .from("course_tees")
      .select("id, course_rating, slope_rating, par")
      .in("id", allTeeIds);
    const teeMap = new Map((teesData || []).map((t) => [t.id, t]));

    // 1. Create round
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .insert({
        created_by: userId,
        course_id,
        tee_id,
        round_type: round_type || "18",
        round_date: round_date || new Date().toISOString().split("T")[0],
        status: isComplete ? "completed" : "in_progress",
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (roundError) {
      return NextResponse.json({ error: roundError.message }, { status: 500 });
    }

    // 2. Batch insert all round_players (each player may have their own tee)
    const playerRows = allPlayers.map((p, i) => {
      const playerTeeId = p.tee_id || tee_id;
      const playerTee = teeMap.get(playerTeeId);
      let scoreDifferential: number | null = null;
      if (p.final_gross_score != null && playerTee?.course_rating && playerTee?.slope_rating) {
        scoreDifferential = calculateDifferential(p.final_gross_score, playerTee.course_rating, playerTee.slope_rating);
      }
      return {
        round_id: round.id,
        user_id: p.user_id,
        tee_id: playerTeeId,
        player_position: i + 1,
        is_scorer: p.user_id === userId,
        final_gross_score: p.final_gross_score ?? null,
        score_differential: scoreDifferential,
      };
    });

    const { data: roundPlayers, error: rpError } = await supabase
      .from("round_players")
      .insert(playerRows)
      .select();

    if (rpError) {
      return NextResponse.json({ error: rpError.message }, { status: 500 });
    }

    // 3. Batch insert all hole scores (if provided)
    if (hasHoleScores && roundPlayers) {
      const scoreRows: {
        round_id: string;
        round_player_id: string;
        hole_number: number;
        strokes: number;
        penalty_strokes: number;
      }[] = [];

      for (const rp of roundPlayers) {
        const playerHoles = hole_scores[rp.user_id];
        if (!playerHoles) continue;

        for (const [holeStr, strokes] of Object.entries(playerHoles)) {
          scoreRows.push({
            round_id: round.id,
            round_player_id: rp.id,
            hole_number: parseInt(holeStr),
            strokes: strokes as number,
            penalty_strokes: 0,
          });
        }
      }

      if (scoreRows.length > 0) {
        const { error: scoresError } = await supabase
          .from("round_scores")
          .insert(scoreRows);

        if (scoresError) {
          return NextResponse.json({ error: scoresError.message }, { status: 500 });
        }
      }
    }

    // If completed, calculate adjusted scores (when hole data exists) and recalculate handicaps
    if (isComplete && roundPlayers) {
      const playerUserIds = new Set<string>();

      if (hasHoleScores) {
        // Fetch course holes for adjusted gross score calculation
        const { data: courseHoles } = await supabase
          .from("course_holes")
          .select("hole_number, par, handicap_index, tee_id")
          .in("tee_id", allTeeIds);

        if (courseHoles && courseHoles.length > 0) {
          const holesByTee = new Map<string, { hole_number: number; par: number; handicap_index: number }[]>();
          for (const h of courseHoles) {
            const arr = holesByTee.get(h.tee_id) || [];
            arr.push({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index });
            holesByTee.set(h.tee_id, arr);
          }

          for (const rp of roundPlayers) {
            if (rp.final_gross_score == null) continue;
            const playerTeeId = allPlayers.find((p) => p.user_id === rp.user_id)?.tee_id || tee_id;
            const tee = teeMap.get(playerTeeId);
            const holes = holesByTee.get(playerTeeId);
            const playerHoles = hole_scores[rp.user_id];
            if (!tee || !holes || !playerHoles) continue;

            // Get player's current handicap for NDB calculation
            const { data: playerHcp } = await supabase
              .from("player_handicaps")
              .select("handicap_index")
              .eq("user_id", rp.user_id)
              .maybeSingle();
            const hi = playerHcp?.handicap_index ?? 0;
            const courseHandicap = calculateCourseHandicap(hi, tee.slope_rating, tee.course_rating, tee.par);

            const holeMap = new Map(holes.map((h) => [h.hole_number, h]));
            const holeScoreData = Object.entries(playerHoles)
              .filter(([hNum]) => holeMap.has(parseInt(hNum)))
              .map(([hNum, strokes]) => ({
                strokes: strokes as number,
                par: holeMap.get(parseInt(hNum))!.par,
                handicap_index: holeMap.get(parseInt(hNum))!.handicap_index,
              }));

            if (holeScoreData.length > 0) {
              const adjustedGross = calculateAdjustedGrossScore(holeScoreData, courseHandicap);
              const differential = calculateDifferential(adjustedGross, tee.course_rating, tee.slope_rating);
              await supabase
                .from("round_players")
                .update({ final_adjusted_score: adjustedGross, score_differential: differential })
                .eq("id", rp.id);
            }

            playerUserIds.add(rp.user_id);
          }
        }
      }

      // If no hole scores (Quick Entry), still recalculate handicaps
      if (!hasHoleScores) {
        for (const rp of roundPlayers) {
          playerUserIds.add(rp.user_id);
        }
      }

      // Recalculate handicap for all players
      await Promise.all(
        [...playerUserIds].map((uid) => recalculateHandicap(supabase, uid))
      );
    }

    return NextResponse.json({ round, round_players: roundPlayers });
  } catch {
    return NextResponse.json({ error: "Failed to create round" }, { status: 500 });
  }
}
