import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { recalcAffectedPlayers } from "@/lib/v2/golf/recalc";

/**
 * POST — finalize an in-progress round: flip status → completed, stamp
 * completed_at, and compute each player's gross / adjusted / differential and
 * recalc their handicap (via the shared pipeline). Co-equal ownership: any
 * player on the round (or its creator) may complete it. Idempotent-ish — running
 * it on an already-completed round just recomputes.
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

  const { data: roster } = await admin
    .from("v2_round_players")
    .select("id, user_id")
    .eq("round_id", roundId);
  const isPlayer = (roster || []).some((r) => r.user_id === userId);
  if (round.created_by !== userId && !isPlayer) {
    return NextResponse.json({ error: "Only players in this round can complete it" }, { status: 403 });
  }

  const playerIds = (roster || []).map((r) => r.id);

  const { error: statusErr } = await admin
    .from("v2_rounds")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", roundId);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  await recalcAffectedPlayers(admin, roundId, round.round_type ?? "18", playerIds, round.format);

  return NextResponse.json({ success: true });
}
