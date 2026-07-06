import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { canManageRound } from "@/lib/rounds/access";
import { recalcAffectedPlayers } from "@/lib/golf/recalc";

/**
 * @swagger
 * /api/rounds/{id}/edit:
 *   put:
 *     summary: Edit a completed round (date, per-player tees, per-hole strokes/putts)
 *     tags: [Rounds]
 *     description: |
 *       Unified post-completion edit. Permission gate: any player in the
 *       round, or an admin (issue #130). On success: recomputes gross /
 *       adjusted-gross / score_differential for every affected player and
 *       recalculates their handicap. Stamps rounds.edited_at + edited_by.
 *     responses:
 *       200: { description: Updated }
 *       401: { description: Unauthorized }
 *       403: { description: Not the scorer / not an admin }
 *       404: { description: Round not found }
 */
type EditBody = {
  round_date?: string;
  player_tees?: { round_player_id: string; tee_id: string }[];
  player_scores?: {
    round_player_id: string;
    scores: { hole_number: number; strokes: number; putts?: number | null }[];
  }[];
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: roundId } = await params;
  const effectiveUserId = await getEffectiveUserId(user.id);

  // Use admin client for reads/writes — RLS on rounds prevents viewer who
  // isn't the creator from updating, but admins editing someone else's
  // round need to be able to write.
  const admin = createAdminClient();

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, status, created_by, round_type, format, course_id")
    .eq("id", roundId)
    .single();

  if (!roundRow) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (roundRow.status !== "completed") {
    return NextResponse.json(
      { error: "Only completed rounds can be edited here. Use the live scoring flow for in-progress rounds." },
      { status: 400 },
    );
  }

  const access = await canManageRound(roundId, effectiveUserId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Only players in this round or an admin can edit it" },
      { status: 403 },
    );
  }

  let body: EditBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { round_date, player_tees, player_scores } = body;

  // Validate any submitted player_ids actually belong to this round and any
  // submitted tee_ids belong to this course. Belt and suspenders against a
  // malicious client trying to overwrite a different round's data.
  const { data: roundPlayers } = await admin
    .from("round_players")
    .select("id, tee_id")
    .eq("round_id", roundId);

  const roundPlayerIds = new Set((roundPlayers || []).map((p) => p.id));
  const affectedPlayerIds = new Set<string>();

  if (player_tees && player_tees.length > 0) {
    for (const pt of player_tees) {
      if (!roundPlayerIds.has(pt.round_player_id)) {
        return NextResponse.json(
          { error: `round_player_id ${pt.round_player_id} not in this round` },
          { status: 400 },
        );
      }
    }
    const teeIds = [...new Set(player_tees.map((pt) => pt.tee_id))];
    const { data: validTees } = await admin
      .from("course_tees")
      .select("id")
      .eq("course_id", roundRow.course_id)
      .in("id", teeIds);
    const validTeeSet = new Set((validTees || []).map((t) => t.id));
    for (const pt of player_tees) {
      if (!validTeeSet.has(pt.tee_id)) {
        return NextResponse.json(
          { error: `tee_id ${pt.tee_id} is not on this round's course` },
          { status: 400 },
        );
      }
    }
  }

  if (player_scores && player_scores.length > 0) {
    for (const ps of player_scores) {
      if (!roundPlayerIds.has(ps.round_player_id)) {
        return NextResponse.json(
          { error: `round_player_id ${ps.round_player_id} not in this round` },
          { status: 400 },
        );
      }
    }
  }

  // 1) Round date (round-level).
  if (round_date && /^\d{4}-\d{2}-\d{2}$/.test(round_date)) {
    const { error } = await admin
      .from("rounds")
      .update({ round_date })
      .eq("id", roundId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // 2) Per-player tee.
  if (player_tees && player_tees.length > 0) {
    await Promise.all(
      player_tees.map((pt) =>
        admin
          .from("round_players")
          .update({ tee_id: pt.tee_id })
          .eq("id", pt.round_player_id),
      ),
    );
    for (const pt of player_tees) affectedPlayerIds.add(pt.round_player_id);
  }

  // 3) Per-hole scores (strokes + putts).
  if (player_scores && player_scores.length > 0) {
    const rows: {
      round_id: string;
      round_player_id: string;
      hole_number: number;
      strokes: number;
      putts: number | null;
      penalty_strokes: number;
    }[] = [];
    for (const ps of player_scores) {
      for (const s of ps.scores) {
        rows.push({
          round_id: roundId,
          round_player_id: ps.round_player_id,
          hole_number: s.hole_number,
          strokes: s.strokes,
          putts: s.putts ?? null,
          penalty_strokes: 0,
        });
      }
      affectedPlayerIds.add(ps.round_player_id);
    }

    if (rows.length > 0) {
      const { error } = await admin
        .from("round_scores")
        .upsert(rows, { onConflict: "round_player_id,hole_number" });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  // 4) Recompute every affected player (a tee change with no score change
  // still needs adjusted/differential recompute against the new tee's
  // rating/slope/par). Then stamp edited_at + edited_by.
  if (affectedPlayerIds.size > 0) {
    await recalcAffectedPlayers(admin, roundId, roundRow.round_type ?? "18", [...affectedPlayerIds], roundRow.format);
  }

  if (round_date || (player_tees && player_tees.length > 0) || (player_scores && player_scores.length > 0)) {
    await admin
      .from("rounds")
      .update({ edited_at: new Date().toISOString(), edited_by: effectiveUserId })
      .eq("id", roundId);
  }

  return NextResponse.json({ success: true });
}
