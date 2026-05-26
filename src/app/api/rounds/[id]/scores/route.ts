import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";
import { canManageRound } from "@/lib/rounds/access";
import { recalcAffectedPlayers } from "@/lib/golf/recalc";

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

  const effectiveUserId = await getEffectiveUserId(user.id);

  // Look up the round once so we can gate post-completion edits and trigger
  // the right downstream recalc (adjusted/diff/handicap) afterwards.
  const { data: roundRow } = await supabase
    .from("rounds")
    .select("id, status, created_by, round_type, tee_id")
    .eq("id", roundId)
    .single();

  if (!roundRow) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const isCompletedRound = roundRow.status === "completed";
  if (isCompletedRound) {
    // Co-equal ownership (issue #130): any player or admin can post-edit.
    const access = await canManageRound(roundId, effectiveUserId);
    if (!access.allowed) {
      return NextResponse.json(
        { error: "Only players in this round or an admin can edit it" },
        { status: 403 },
      );
    }
  }

  try {
    const body = await request.json();
    const { scores, player_scores } = body;

    const affectedPlayerIds: string[] = [];
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

    if (player_scores && Array.isArray(player_scores)) {
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
        affectedPlayerIds.push(round_player_id);
      }
    } else {
      if (!scores || !Array.isArray(scores)) {
        return NextResponse.json({ error: "scores array is required" }, { status: 400 });
      }

      const { data: roundPlayer } = await supabase
        .from("round_players")
        .select("id")
        .eq("round_id", roundId)
        .eq("user_id", effectiveUserId)
        .single();

      if (!roundPlayer) {
        return NextResponse.json({ error: "Player not found in this round" }, { status: 404 });
      }

      for (const score of scores as { hole_number: number; strokes: number; putts?: number | null; fairway_hit?: boolean | null; green_in_regulation?: boolean | null; penalty_strokes?: number }[]) {
        allRows.push({
          round_id: roundId,
          round_player_id: roundPlayer.id,
          hole_number: score.hole_number,
          strokes: score.strokes,
          putts: score.putts ?? null,
          fairway_hit: score.fairway_hit ?? null,
          green_in_regulation: score.green_in_regulation ?? null,
          penalty_strokes: score.penalty_strokes ?? 0,
        });
      }
      affectedPlayerIds.push(roundPlayer.id);
    }

    if (allRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("round_scores")
        .upsert(allRows, { onConflict: "round_player_id,hole_number" });
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    // Recalculate gross score from ALL hole scores in DB (not just this batch)
    if (affectedPlayerIds.length > 0) {
      const { data: allDbScores } = await supabase
        .from("round_scores")
        .select("round_player_id, strokes")
        .in("round_player_id", affectedPlayerIds);

      const totalsByPlayer = new Map<string, number>();
      for (const s of allDbScores || []) {
        totalsByPlayer.set(s.round_player_id, (totalsByPlayer.get(s.round_player_id) || 0) + s.strokes);
      }

      await Promise.all(
        affectedPlayerIds.map((rpId) =>
          supabase
            .from("round_players")
            .update({ final_gross_score: totalsByPlayer.get(rpId) || null })
            .eq("id", rpId)
        )
      );
    }

    // Post-completion edits: stamp edited_at / edited_by, recompute
    // adjusted-gross + score_differential for affected players, and
    // recalculate their handicaps. This mirrors the completion flow in
    // PUT /api/rounds/[id] but never re-flips status.
    if (isCompletedRound && affectedPlayerIds.length > 0) {
      await recalcAffectedPlayers(supabase, roundId, roundRow.round_type ?? "18", affectedPlayerIds);

      await supabase
        .from("rounds")
        .update({ edited_at: new Date().toISOString(), edited_by: effectiveUserId })
        .eq("id", roundId);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }
}
