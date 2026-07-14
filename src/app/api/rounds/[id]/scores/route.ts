import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";
import { canManageRound } from "@/lib/rounds/access";
import { recalcAffectedPlayers } from "@/lib/golf/recalc";
import {
  notifyFavoritesHolesScored,
  type HoleTransition,
} from "@/lib/favorites/fanout";

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
    .select("id, status, created_by, round_type, format, tee_id")
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

    // Issue #140 — before the upsert, snapshot which (player, hole) cells
    // already have a score so we can tell first-scores (null→value) apart from
    // edits. Only first-scores fire hole-by-hole favorite notifications; edits
    // never re-notify. Skipped for completed rounds (no live watchers).
    const notifyHoles = !isCompletedRound && roundRow.format !== "scramble";
    let existingCells = new Set<string>();
    if (notifyHoles && allRows.length > 0) {
      const { data: existing } = await supabase
        .from("round_scores")
        .select("round_player_id, hole_number")
        .in("round_player_id", affectedPlayerIds);
      existingCells = new Set(
        (existing || []).map((s) => `${s.round_player_id}:${s.hole_number}`)
      );
    }

    if (allRows.length > 0) {
      const { error: upsertError } = await supabase
        .from("round_scores")
        .upsert(allRows, { onConflict: "round_player_id,hole_number" });
      if (upsertError) {
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    // Recalculate gross score from ALL hole scores in DB (not just this batch).
    // Kept hoisted so the favorite-notification block below can reuse it to
    // compute each player's cumulative to-par standing without another query.
    let allDbScores: { round_player_id: string; hole_number: number; strokes: number }[] = [];
    if (affectedPlayerIds.length > 0) {
      const { data } = await supabase
        .from("round_scores")
        .select("round_player_id, hole_number, strokes")
        .in("round_player_id", affectedPlayerIds);
      allDbScores = data ?? [];

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
      await recalcAffectedPlayers(supabase, roundId, roundRow.round_type ?? "18", affectedPlayerIds, roundRow.format);

      await supabase
        .from("rounds")
        .update({ edited_at: new Date().toISOString(), edited_by: effectiveUserId })
        .eq("id", roundId);
    }

    // Issue #140 — fan hole-by-hole pushes out to favoriters. Only first-scores
    // (cells not present before this request), only roster rows with a real
    // user_id (guests skipped), coalesced per request inside the helper.
    if (notifyHoles) {
      const firstScores = allRows.filter(
        (r) => !existingCells.has(`${r.round_player_id}:${r.hole_number}`)
      );
      if (firstScores.length > 0) {
        const rpIds = [...new Set(firstScores.map((r) => r.round_player_id))];
        const { data: rpRows } = await supabase
          .from("round_players")
          .select("id, user_id, tee_id")
          .in("id", rpIds);

        const rpById = new Map(
          (rpRows || []).map((rp) => [rp.id, rp as { id: string; user_id: string | null; tee_id: string | null }])
        );
        const userIds = [
          ...new Set(
            (rpRows || []).map((rp) => rp.user_id).filter((u): u is string => !!u)
          ),
        ];
        const teeIds = [
          ...new Set(
            (rpRows || []).map((rp) => rp.tee_id).filter((t): t is string => !!t)
          ),
        ];

        if (userIds.length > 0) {
          const [{ data: names }, { data: holePars }] = await Promise.all([
            supabase.from("users").select("id, display_name").in("id", userIds),
            teeIds.length > 0
              ? supabase
                  .from("course_holes")
                  .select("tee_id, hole_number, par")
                  .in("tee_id", teeIds)
              : Promise.resolve({ data: [] as { tee_id: string; hole_number: number; par: number }[] }),
          ]);

          const nameById = new Map((names || []).map((n) => [n.id, n.display_name]));
          const parByCell = new Map(
            (holePars || []).map((h) => [`${h.tee_id}:${h.hole_number}`, h.par])
          );

          // Cumulative to-par per roster row, computed over every scored hole in
          // the DB (post-upsert), so the push can say e.g. "3 over thru 7".
          const standingByRp = new Map<string, { toPar: number | null; holes: number }>();
          const scoresByRp = new Map<string, { hole: number; strokes: number }[]>();
          for (const s of allDbScores) {
            if (!scoresByRp.has(s.round_player_id)) scoresByRp.set(s.round_player_id, []);
            scoresByRp.get(s.round_player_id)!.push({ hole: s.hole_number, strokes: s.strokes });
          }
          for (const [rpId, rows] of scoresByRp) {
            const teeId = rpById.get(rpId)?.tee_id;
            let toPar = 0;
            let counted = 0;
            for (const row of rows) {
              const par = teeId ? parByCell.get(`${teeId}:${row.hole}`) : undefined;
              if (par != null) {
                toPar += row.strokes - par;
                counted++;
              }
            }
            standingByRp.set(rpId, { toPar: counted > 0 ? toPar : null, holes: counted });
          }

          const transitions: HoleTransition[] = [];
          for (const r of firstScores) {
            const rp = rpById.get(r.round_player_id);
            if (!rp?.user_id) continue; // skip guests
            const standing = standingByRp.get(r.round_player_id);
            transitions.push({
              playerUserId: rp.user_id,
              playerName: nameById.get(rp.user_id) || "A Loozer",
              hole: r.hole_number,
              strokes: r.strokes,
              par: rp.tee_id ? parByCell.get(`${rp.tee_id}:${r.hole_number}`) ?? null : null,
              standingToPar: standing?.toPar ?? null,
              holesPlayed: standing?.holes ?? 0,
            });
          }

          await notifyFavoritesHolesScored({ roundId, transitions });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save scores" }, { status: 500 });
  }
}
