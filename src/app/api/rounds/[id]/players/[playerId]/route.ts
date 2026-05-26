import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { canManageRound } from "@/lib/rounds/access";

/**
 * @swagger
 * /api/rounds/{id}/players/{playerId}:
 *   delete:
 *     summary: Remove a player from a round
 *     tags: [Rounds]
 *     description: |
 *       Issue #130 co-equal ownership. Any player in the round (or an admin)
 *       can remove a player. Cascades to that player's `round_scores` via the
 *       existing FK. If the removed player was the last one, the round is
 *       deleted as well — response includes `round_deleted: true` so the
 *       client can redirect.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: round_players.id
 *     responses:
 *       200: { description: Player removed }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Round or player not found }
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: roundId, playerId } = await params;
  const effectiveUserId = await getEffectiveUserId(user.id);

  const access = await canManageRound(roundId, effectiveUserId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Round not found" : "Forbidden" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  const admin = createAdminClient();

  const { data: playerRow } = await admin
    .from("round_players")
    .select("id, user_id, round_id")
    .eq("id", playerId)
    .eq("round_id", roundId)
    .maybeSingle();
  if (!playerRow) {
    return NextResponse.json({ error: "Player not in this round" }, { status: 404 });
  }

  // Count remaining players up-front so we know whether to nuke the round.
  const { count: rosterCount } = await admin
    .from("round_players")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);

  // Delete this player. round_scores cascades via FK.
  const { error: deleteError } = await admin
    .from("round_players")
    .delete()
    .eq("id", playerId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // If this was the last player, the round serves no purpose — cascade up.
  let roundDeleted = false;
  if ((rosterCount ?? 0) <= 1) {
    const { error: roundDeleteError } = await admin
      .from("rounds")
      .delete()
      .eq("id", roundId);
    if (!roundDeleteError) roundDeleted = true;
  }

  return NextResponse.json({
    success: true,
    removed_user_id: playerRow.user_id,
    round_deleted: roundDeleted,
  });
}
