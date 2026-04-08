import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - Get all scores for a round
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: scores, error } = await supabase
    .from("round_scores")
    .select("*")
    .eq("round_id", id)
    .order("hole_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ scores: scores || [] });
}

// POST - Upsert hole scores (batch)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: roundId } = await params;

  try {
    const body = await request.json();
    const { scores, player_scores } = body;

    if (player_scores && Array.isArray(player_scores)) {
      // Multi-player: batch upsert all scores + batch update gross scores
      const allRows: {
        round_id: string;
        round_player_id: string;
        hole_number: number;
        strokes: number;
        putts: number | null;
        fairway_hit: boolean | null;
        green_in_regulation: boolean | null;
        penalty_strokes: number;
      }[] = [];

      const grossUpdates: PromiseLike<unknown>[] = [];

      for (const ps of player_scores) {
        const { round_player_id, scores: playerScores } = ps;
        if (!round_player_id || !playerScores) continue;

        for (const score of playerScores) {
          allRows.push({
            round_id: roundId,
            round_player_id,
            hole_number: score.hole_number,
            strokes: score.strokes,
            putts: score.putts ?? null,
            fairway_hit: score.fairway_hit ?? null,
            green_in_regulation: score.green_in_regulation ?? null,
            penalty_strokes: score.penalty_strokes ?? 0,
          });
        }

        const totalStrokes = playerScores.reduce((sum: number, s: { strokes: number }) => sum + s.strokes, 0);
        grossUpdates.push(
          supabase
            .from("round_players")
            .update({ final_gross_score: totalStrokes })
            .eq("id", round_player_id)
        );
      }

      // One batch upsert for all scores, parallel gross score updates
      const [upsertResult] = await Promise.all([
        supabase
          .from("round_scores")
          .upsert(allRows, { onConflict: "round_player_id,hole_number" }),
        ...grossUpdates,
      ]);

      if (upsertResult.error) {
        return NextResponse.json({ error: upsertResult.error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Single-player format
    if (!scores || !Array.isArray(scores)) {
      return NextResponse.json({ error: "scores array is required" }, { status: 400 });
    }

    const effectiveUserId = await getEffectiveUserId(user.id);
    const { data: roundPlayer } = await supabase
      .from("round_players")
      .select("id")
      .eq("round_id", roundId)
      .eq("user_id", effectiveUserId)
      .single();

    if (!roundPlayer) {
      return NextResponse.json({ error: "Player not found in this round" }, { status: 404 });
    }

    const rows = scores.map((score: { hole_number: number; strokes: number; putts?: number | null; fairway_hit?: boolean | null; green_in_regulation?: boolean | null; penalty_strokes?: number }) => ({
      round_id: roundId,
      round_player_id: roundPlayer.id,
      hole_number: score.hole_number,
      strokes: score.strokes,
      putts: score.putts ?? null,
      fairway_hit: score.fairway_hit ?? null,
      green_in_regulation: score.green_in_regulation ?? null,
      penalty_strokes: score.penalty_strokes ?? 0,
    }));

    const totalStrokes = scores.reduce((sum: number, s: { strokes: number }) => sum + s.strokes, 0);

    // Batch upsert scores + update gross in parallel
    const [upsertResult] = await Promise.all([
      supabase
        .from("round_scores")
        .upsert(rows, { onConflict: "round_player_id,hole_number" }),
      supabase
        .from("round_players")
        .update({ final_gross_score: totalStrokes })
        .eq("id", roundPlayer.id),
    ]);

    if (upsertResult.error) {
      return NextResponse.json({ error: upsertResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }
}
