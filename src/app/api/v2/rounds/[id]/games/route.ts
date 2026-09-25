import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * Create a side game on an existing round (#183) — the retroactive "Add game"
 * button on the live scorer. Co-equal ownership: the round's creator or any
 * player on it may add a game. Participants are round_player ids.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: roundId } = await params;

  const admin = v2AdminClient();
  const { data: round } = await admin
    .from("v2_rounds")
    .select("id, created_by, round_type")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const { data: roster } = await admin.from("v2_round_players").select("id, user_id").eq("round_id", roundId);
  const isPlayer = (roster || []).some((r) => r.user_id === userId);
  if (round.created_by !== userId && !isPlayer) {
    return NextResponse.json({ error: "Only players in this round can add a game" }, { status: 403 });
  }
  const rosterIds = new Set((roster || []).map((r) => r.id));

  let body: { game_type?: string; is_net?: boolean; value?: number | null; participant_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const gameType = body.game_type;
  if (gameType !== "skins" && gameType !== "nassau" && gameType !== "sixes") {
    return NextResponse.json({ error: "Unknown game type" }, { status: 400 });
  }

  const ids = Array.isArray(body.participant_ids) ? [...new Set(body.participant_ids.filter((x) => rosterIds.has(x)))] : [];
  if (gameType === "nassau" && ids.length !== 2) {
    return NextResponse.json({ error: "Nassau needs exactly two players." }, { status: 400 });
  }
  if (gameType === "sixes") {
    if (round.round_type !== "18") return NextResponse.json({ error: "6-6-6 needs a full 18 holes." }, { status: 400 });
    if (ids.length !== 4) return NextResponse.json({ error: "6-6-6 needs exactly four players." }, { status: 400 });
  }
  if (ids.length < 2) {
    return NextResponse.json({ error: "A game needs at least two players." }, { status: 400 });
  }

  const { data: created, error } = await admin
    .from("v2_round_games")
    .insert({
      round_id: roundId,
      game_type: gameType,
      is_net: !!body.is_net,
      config: typeof body.value === "number" && body.value > 0 ? { value: body.value } : {},
      participant_ids: ids,
      created_by: userId,
    })
    .select("id, game_type, is_net, participant_ids, config")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    game: {
      id: created.id,
      game_type: created.game_type,
      is_net: created.is_net,
      participant_ids: created.participant_ids || [],
      value: typeof created.config?.value === "number" ? created.config.value : null,
    },
  });
}
