import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * Edit or remove a side game after it's been created (#183). A mistake in the
 * stake, gross/net, or roster shouldn't force a re-create. Co-equal ownership:
 * the round's creator or any player on it may change a game.
 */
async function authorize(request: Request, roundId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };

  const admin = v2AdminClient();
  const { data: round } = await admin.from("v2_rounds").select("id, created_by").eq("id", roundId).maybeSingle();
  if (!round) return { error: NextResponse.json({ error: "Round not found" }, { status: 404 }) };

  const { data: roster } = await admin.from("v2_round_players").select("id, user_id").eq("round_id", roundId);
  const isPlayer = (roster || []).some((r) => r.user_id === userId);
  if (round.created_by !== userId && !isPlayer) {
    return { error: NextResponse.json({ error: "Only players in this round can edit its games" }, { status: 403 }) };
  }
  return { admin, rosterIds: new Set((roster || []).map((r) => r.id)) };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; gameId: string }> }) {
  const { id: roundId, gameId } = await params;
  const auth = await authorize(request, roundId);
  if ("error" in auth) return auth.error;
  const { admin, rosterIds } = auth;

  const { data: game } = await admin
    .from("v2_round_games")
    .select("id, round_id, game_type")
    .eq("id", gameId)
    .maybeSingle();
  if (!game || game.round_id !== roundId) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  let body: { is_net?: boolean; value?: number | null; participant_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};

  if (typeof body.is_net === "boolean") patch.is_net = body.is_net;

  if ("value" in body) {
    const v = body.value;
    patch.config = typeof v === "number" && v > 0 ? { value: v } : {};
  }

  if (Array.isArray(body.participant_ids)) {
    const ids = [...new Set(body.participant_ids.filter((x) => rosterIds.has(x)))];
    if (game.game_type === "nassau" && ids.length !== 2) {
      return NextResponse.json({ error: "Nassau needs exactly two players." }, { status: 400 });
    }
    if (game.game_type === "sixes" && ids.length !== 4) {
      return NextResponse.json({ error: "6-6-6 needs exactly four players." }, { status: 400 });
    }
    if (ids.length < 2) {
      return NextResponse.json({ error: "A game needs at least two players." }, { status: 400 });
    }
    patch.participant_ids = ids;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: updated, error } = await admin
    .from("v2_round_games")
    .update(patch)
    .eq("id", gameId)
    .select("id, game_type, is_net, participant_ids, config")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    game: {
      id: updated.id,
      game_type: updated.game_type,
      is_net: updated.is_net,
      participant_ids: updated.participant_ids || [],
      value: typeof updated.config?.value === "number" ? updated.config.value : null,
    },
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; gameId: string }> }) {
  const { id: roundId, gameId } = await params;
  const auth = await authorize(request, roundId);
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const { error } = await admin.from("v2_round_games").delete().eq("id", gameId).eq("round_id", roundId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
