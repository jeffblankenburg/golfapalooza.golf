import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { recalcAffectedPlayers } from "@/lib/v2/golf/recalc";

const STAT_FIELDS = ["strokes", "putts", "fairway_hit", "green_in_regulation", "penalty_strokes"] as const;

interface HoleScoreIn {
  hole_number: number;
  strokes?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  green_in_regulation?: boolean | null;
  penalty_strokes?: number | null;
}

/**
 * GET — every hole score for a round (strokes + optional tracked stats).
 * @swagger ignored (internal scorer endpoint).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const admin = v2AdminClient();
  const { data: scores, error } = await admin
    .from("v2_round_scores")
    .select("round_player_id, hole_number, strokes, putts, fairway_hit, green_in_regulation, penalty_strokes")
    .eq("round_id", id)
    .order("hole_number");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scores: scores || [] });
}

/**
 * POST — batch upsert hole scores. Body: `{ player_scores: [{ round_player_id,
 * scores: [{ hole_number, strokes, putts, ... }] }] }`. Recomputes each affected
 * player's gross; if the round is already completed, also recomputes
 * adjusted/differential/handicap (co-equal post-round editing).
 * Co-equal ownership: any player on the round (or its creator) may write.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: roundId } = await params;

  const admin = v2AdminClient();
  const { data: round } = await admin
    .from("v2_rounds")
    .select("id, status, created_by, round_type, format")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  // Access: creator or any player on the round.
  const { data: roster } = await admin
    .from("v2_round_players")
    .select("id, user_id")
    .eq("round_id", roundId);
  const isPlayer = (roster || []).some((r) => r.user_id === userId);
  if (round.created_by !== userId && !isPlayer) {
    return NextResponse.json({ error: "Only players in this round can edit it" }, { status: 403 });
  }
  const validRpIds = new Set((roster || []).map((r) => r.id));

  let body: { player_scores?: { round_player_id?: string; scores?: HoleScoreIn[] }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!Array.isArray(body.player_scores)) {
    return NextResponse.json({ error: "player_scores array is required" }, { status: 400 });
  }

  const rows: Record<string, unknown>[] = [];
  const affected = new Set<string>();
  for (const ps of body.player_scores) {
    if (!ps.round_player_id || !validRpIds.has(ps.round_player_id) || !Array.isArray(ps.scores)) continue;
    for (const s of ps.scores) {
      if (typeof s.hole_number !== "number" || s.hole_number < 1 || s.hole_number > 18) continue;
      const row: Record<string, unknown> = {
        round_id: roundId,
        round_player_id: ps.round_player_id,
        hole_number: s.hole_number,
      };
      // Only write fields that were provided, so a strokes-only save doesn't null putts.
      for (const f of STAT_FIELDS) if (f in s) row[f] = s[f as keyof HoleScoreIn] ?? null;
      rows.push(row);
    }
    affected.add(ps.round_player_id);
  }

  if (rows.length > 0) {
    const { error: upErr } = await admin
      .from("v2_round_scores")
      .upsert(rows, { onConflict: "round_player_id,hole_number" });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // Recompute gross from ALL of each affected player's hole scores (not just this batch).
  const affectedIds = [...affected];
  if (affectedIds.length > 0) {
    const { data: allScores } = await admin
      .from("v2_round_scores")
      .select("round_player_id, strokes")
      .in("round_player_id", affectedIds);
    const totals = new Map<string, number>();
    for (const s of allScores || []) {
      if (s.strokes != null) totals.set(s.round_player_id, (totals.get(s.round_player_id) || 0) + s.strokes);
    }
    await Promise.all(
      affectedIds.map((rpId) =>
        admin.from("v2_round_players").update({ final_gross_score: totals.get(rpId) ?? null }).eq("id", rpId),
      ),
    );

    // Post-completion edits recompute the derived stats + handicap immediately.
    if (round.status === "completed") {
      await recalcAffectedPlayers(admin, roundId, round.round_type ?? "18", affectedIds, round.format);
    }
  }

  return NextResponse.json({ success: true });
}
