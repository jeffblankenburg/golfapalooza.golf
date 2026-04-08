import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateDifferential } from "@/lib/golf/calculator";
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
        final_gross_score,
        final_adjusted_score,
        score_differential
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
    const tee = Array.isArray(r.tee) ? r.tee[0] : r.tee;
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
      .select("id, course_rating, slope_rating")
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

    return NextResponse.json({ round, round_players: roundPlayers });
  } catch {
    return NextResponse.json({ error: "Failed to create round" }, { status: 500 });
  }
}
