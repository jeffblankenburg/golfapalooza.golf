import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { recalcAffectedPlayers } from "@/lib/v2/golf/recalc";
import { notifyFavoritesHolesScored, type HoleTransition } from "@/lib/v2/rounds/favorites-fanout";

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
    .select("id, status, created_by, round_type, format, tee_id")
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
  // Every (player, hole) getting a real stroke this save — the raw material for
  // follower "hole-by-hole" pushes (filtered to first scores below).
  const strokeWrites: { round_player_id: string; hole_number: number; strokes: number }[] = [];
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
      if (typeof s.strokes === "number") {
        strokeWrites.push({ round_player_id: ps.round_player_id, hole_number: s.hole_number, strokes: s.strokes });
      }
    }
    affected.add(ps.round_player_id);
  }

  // Which (player, hole) already had a stroke BEFORE this save — so we notify
  // followers only on the FIRST time a hole is scored, never on an edit.
  const prevScored = new Set<string>();
  if (strokeWrites.length > 0 && round.status === "in_progress") {
    const { data: before } = await admin
      .from("v2_round_scores")
      .select("round_player_id, hole_number, strokes")
      .eq("round_id", roundId)
      .in("round_player_id", [...affected]);
    for (const b of before || []) if (b.strokes != null) prevScored.add(`${b.round_player_id}:${b.hole_number}`);
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
      .select("round_player_id, hole_number, strokes")
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

    // Follower "hole-by-hole" pushes (#187): only in a live round, and only the
    // FIRST time each hole is scored (prevScored excludes edits).
    if (round.status === "in_progress" && strokeWrites.length > 0) {
      const userByRp = new Map((roster || []).map((r) => [r.id, r.user_id]));
      const scoredByRp = new Map<string, Map<number, number>>();
      for (const s of allScores || []) {
        if (s.strokes == null) continue;
        let m = scoredByRp.get(s.round_player_id);
        if (!m) {
          m = new Map();
          scoredByRp.set(s.round_player_id, m);
        }
        m.set(s.hole_number, s.strokes);
      }
      const { data: holeRows } = round.tee_id
        ? await admin.from("v2_course_holes").select("hole_number, par").eq("tee_id", round.tee_id)
        : { data: [] as { hole_number: number; par: number }[] };
      const parByHole = new Map((holeRows || []).map((h) => [h.hole_number, h.par]));

      const transitions: HoleTransition[] = [];
      for (const w of strokeWrites) {
        const uid = userByRp.get(w.round_player_id);
        if (!uid) continue; // guests don't notify
        if (prevScored.has(`${w.round_player_id}:${w.hole_number}`)) continue; // an edit, not a first score
        let toPar = 0;
        let known = 0;
        let played = 0;
        for (const [h, st] of scoredByRp.get(w.round_player_id) ?? []) {
          played++;
          const p = parByHole.get(h);
          if (p != null) {
            toPar += st - p;
            known++;
          }
        }
        transitions.push({
          playerUserId: uid,
          hole: w.hole_number,
          strokes: w.strokes,
          par: parByHole.get(w.hole_number) ?? null,
          standingToPar: known > 0 ? toPar : null,
          holesPlayed: played,
        });
      }
      if (transitions.length > 0) await notifyFavoritesHolesScored(admin, { roundId, transitions });
    }
  }

  return NextResponse.json({ success: true });
}
