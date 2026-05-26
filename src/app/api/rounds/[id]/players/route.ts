import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { canManageRound } from "@/lib/rounds/access";
import { notifyPlayersAddedToRound } from "@/lib/rounds/notify";

/**
 * @swagger
 * /api/rounds/{id}/players:
 *   post:
 *     summary: Add a player to an in-progress or completed round
 *     tags: [Rounds]
 *     description: |
 *       Issue #130 co-equal ownership. Any player already in the round (or
 *       an admin) can add another Loozer. Inserts a `round_players` row at
 *       the next `player_position`. Reuses the round's default tee unless
 *       a `tee_id` is provided that belongs to the round's course.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id: { type: string, format: uuid }
 *               tee_id:  { type: string, format: uuid }
 *     responses:
 *       200: { description: Player added }
 *       400: { description: Bad request }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Round not found }
 *       409: { description: Player already in round }
 */
export async function POST(
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

  const access = await canManageRound(roundId, effectiveUserId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Round not found" : "Forbidden" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  let body: { user_id?: string; tee_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { user_id: newUserId, tee_id: requestedTeeId } = body;
  if (!newUserId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: round } = await admin
    .from("rounds")
    .select("id, course_id, tee_id")
    .eq("id", roundId)
    .single();
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  // Validate the tee belongs to this course if one was provided.
  let teeId = round.tee_id;
  if (requestedTeeId) {
    const { data: tee } = await admin
      .from("course_tees")
      .select("id")
      .eq("id", requestedTeeId)
      .eq("course_id", round.course_id)
      .maybeSingle();
    if (!tee) {
      return NextResponse.json({ error: "tee_id is not on this round's course" }, { status: 400 });
    }
    teeId = requestedTeeId;
  }

  // Existing roster — used both for dedup and the next player_position.
  const { data: existing } = await admin
    .from("round_players")
    .select("id, user_id, player_position")
    .eq("round_id", roundId)
    .order("player_position", { ascending: true });

  const alreadyIn = (existing || []).some((p) => p.user_id === newUserId);
  if (alreadyIn) {
    return NextResponse.json({ error: "Player already in this round" }, { status: 409 });
  }

  const nextPosition =
    (existing || []).reduce((max, p) => Math.max(max, p.player_position || 0), 0) + 1;

  const { data: inserted, error } = await admin
    .from("round_players")
    .insert({
      round_id: roundId,
      user_id: newUserId,
      tee_id: teeId,
      player_position: nextPosition,
      is_scorer: false,
    })
    .select("id, user_id, tee_id, player_position")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Issue #131 — ping the newly added player with a deep link to the live
  // scorer. Best-effort; never blocks the response.
  await notifyPlayersAddedToRound({
    roundId,
    playerUserIds: [newUserId],
    actorUserId: effectiveUserId,
  });

  return NextResponse.json({ player: inserted, actor_user_id: effectiveUserId });
}
