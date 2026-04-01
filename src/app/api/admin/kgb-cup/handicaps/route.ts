import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeAdjustedHandicaps } from "@/lib/kgb-cup/match-logic";
import { checkIsAdmin } from "@/lib/permissions-server";

// GET - Fetch handicap data for a KGB Cup contest
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // Fetch all participants for this contest with their current handicaps
    const { data: participants } = await adminClient
      .from("contest_participants")
      .select(
        "user_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name)"
      )
      .eq("contest_id", contestId);

    // Fetch current handicap_index for each participant
    const playerIds = (participants || []).map((p) => p.user_id);
    const { data: handicaps } = playerIds.length > 0
      ? await adminClient
          .from("player_handicaps")
          .select("user_id, handicap_index")
          .in("user_id", playerIds)
      : { data: [] };

    const handicapMap = new Map<string, number | null>();
    for (const h of handicaps || []) {
      handicapMap.set(h.user_id, h.handicap_index);
    }

    // Fetch existing snapshots
    const { data: snapshots } = await adminClient
      .from("kgb_cup_player_handicaps")
      .select("player_id, original_handicap, adjusted_handicap")
      .eq("contest_id", contestId);

    const snapshotMap = new Map<string, { original_handicap: number | null; adjusted_handicap: number }>();
    for (const s of snapshots || []) {
      snapshotMap.set(s.player_id, {
        original_handicap: s.original_handicap,
        adjusted_handicap: s.adjusted_handicap,
      });
    }

    // Fetch pairs and pair handicaps
    const { data: teams } = await adminClient
      .from("ryder_cup_teams")
      .select("id, team_number, team_name")
      .eq("contest_id", contestId)
      .order("team_number");

    const teamIds = (teams || []).map((t) => t.id);

    const { data: pairs } = teamIds.length > 0
      ? await adminClient
          .from("ryder_cup_pairs")
          .select(
            "id, team_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name)"
          )
          .in("team_id", teamIds)
          .order("sort_order")
      : { data: [] };

    const { data: pairHandicaps } = await adminClient
      .from("kgb_cup_pair_handicaps")
      .select("pair_id, scramble_handicap")
      .eq("contest_id", contestId);

    const pairHandicapMap = new Map<string, number>();
    for (const ph of pairHandicaps || []) {
      pairHandicapMap.set(ph.pair_id, ph.scramble_handicap);
    }

    // Normalize pairs
    const normalizedPairs = (pairs || []).map((p) => {
      const playerA = Array.isArray(p.player_a) ? p.player_a[0] : p.player_a;
      const playerB = Array.isArray(p.player_b) ? p.player_b[0] : p.player_b;
      return {
        id: p.id,
        team_id: p.team_id,
        player_a: playerA ? { id: playerA.id, display_name: playerA.display_name } : null,
        player_b: playerB ? { id: playerB.id, display_name: playerB.display_name } : null,
        scramble_handicap: pairHandicapMap.get(p.id) ?? null,
      };
    });

    // Build player list
    const playerList = (participants || []).map((p) => {
      const user = Array.isArray(p.user) ? p.user[0] : p.user;
      const snapshot = snapshotMap.get(p.user_id);
      return {
        player_id: p.user_id,
        display_name: (user as { display_name: string } | null)?.display_name || "Unknown",
        full_name: (user as { full_name: string | null } | null)?.full_name || null,
        current_handicap: handicapMap.get(p.user_id) ?? null,
        original_handicap: snapshot?.original_handicap ?? null,
        adjusted_handicap: snapshot?.adjusted_handicap ?? null,
        has_snapshot: !!snapshot,
      };
    });

    return NextResponse.json({
      players: playerList,
      pairs: normalizedPairs,
      teams: teams || [],
    });
  } catch (error) {
    console.error("Get KGB Cup handicaps error:", error);
    return NextResponse.json({ error: "Failed to load handicap data" }, { status: 500 });
  }
}

// POST - Auto-calculate and snapshot handicaps for all participants
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get all participants
    const { data: participants } = await adminClient
      .from("contest_participants")
      .select("user_id")
      .eq("contest_id", contest_id);

    const playerIds = (participants || []).map((p) => p.user_id);

    if (playerIds.length === 0) {
      return NextResponse.json({ error: "No participants found" }, { status: 400 });
    }

    // Fetch current handicaps
    const { data: handicaps } = await adminClient
      .from("player_handicaps")
      .select("user_id, handicap_index")
      .in("user_id", playerIds);

    const handicapMap = new Map<string, number | null>();
    for (const h of handicaps || []) {
      handicapMap.set(h.user_id, h.handicap_index);
    }

    // Compute adjusted handicaps
    const players = playerIds.map((id) => ({
      playerId: id,
      handicapIndex: handicapMap.get(id) ?? null,
    }));

    const adjusted = computeAdjustedHandicaps(players);

    // Upsert into kgb_cup_player_handicaps
    const rows = adjusted.map((a) => ({
      contest_id,
      player_id: a.playerId,
      original_handicap: a.originalHandicap,
      adjusted_handicap: a.adjustedHandicap,
    }));

    const { error: upsertError } = await adminClient
      .from("kgb_cup_player_handicaps")
      .upsert(rows, { onConflict: "contest_id,player_id" });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, players: adjusted });
  } catch (error) {
    console.error("Calculate KGB Cup handicaps error:", error);
    return NextResponse.json({ error: "Failed to calculate handicaps" }, { status: 500 });
  }
}

// PUT - Admin override for individual player handicap or pair scramble handicap
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const adminClient = createAdminClient();

    // Pair scramble handicap update
    if (body.pair_id !== undefined) {
      const { contest_id, pair_id, scramble_handicap } = body;

      if (!contest_id || !pair_id || scramble_handicap === undefined) {
        return NextResponse.json(
          { error: "contest_id, pair_id, and scramble_handicap are required" },
          { status: 400 }
        );
      }

      const { error } = await adminClient
        .from("kgb_cup_pair_handicaps")
        .upsert(
          { contest_id, pair_id, scramble_handicap },
          { onConflict: "contest_id,pair_id" }
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Individual player handicap override
    const { contest_id, player_id, original_handicap, adjusted_handicap } = body;

    if (!contest_id || !player_id || adjusted_handicap === undefined) {
      return NextResponse.json(
        { error: "contest_id, player_id, and adjusted_handicap are required" },
        { status: 400 }
      );
    }

    const { error } = await adminClient
      .from("kgb_cup_player_handicaps")
      .upsert(
        { contest_id, player_id, original_handicap, adjusted_handicap },
        { onConflict: "contest_id,player_id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update KGB Cup handicap error:", error);
    return NextResponse.json({ error: "Failed to update handicap" }, { status: 500 });
  }
}
