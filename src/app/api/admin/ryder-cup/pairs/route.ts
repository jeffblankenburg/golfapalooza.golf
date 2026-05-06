import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// POST - Create an empty pair
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id, sort_order: requestedSortOrder } = await request.json();

    if (!team_id) {
      return NextResponse.json({ error: "team_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Use provided sort_order or auto-increment (skipping pool pairs at sort_order=0)
    let nextOrder: number;
    if (requestedSortOrder !== undefined) {
      nextOrder = requestedSortOrder;
    } else {
      const { data: existing } = await adminClient
        .from("ryder_cup_pairs")
        .select("sort_order")
        .eq("team_id", team_id)
        .gt("sort_order", 0)
        .order("sort_order", { ascending: false })
        .limit(1);

      nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;
    }

    const { data: pair, error } = await adminClient
      .from("ryder_cup_pairs")
      .insert({ team_id, sort_order: nextOrder })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pair });
  } catch (error) {
    console.error("Create ryder cup pair error:", error);
    return NextResponse.json({ error: "Failed to create pair" }, { status: 500 });
  }
}

// PUT - Assign player A or B to a pair
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { pair_id, player_a_id, player_b_id, player_c_id } = await request.json();

    if (!pair_id) {
      return NextResponse.json({ error: "pair_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get the pair's team to find the contest
    const { data: pair } = await adminClient
      .from("ryder_cup_pairs")
      .select("id, team_id, player_a_id, player_b_id, player_c_id")
      .eq("id", pair_id)
      .single();

    if (!pair) {
      return NextResponse.json({ error: "Pair not found" }, { status: 404 });
    }

    const { data: team } = await adminClient
      .from("ryder_cup_teams")
      .select("contest_id")
      .eq("id", pair.team_id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Build updates
    const updates: Record<string, string | null> = {};
    if (player_a_id !== undefined) updates.player_a_id = player_a_id;
    if (player_b_id !== undefined) updates.player_b_id = player_b_id;
    if (player_c_id !== undefined) updates.player_c_id = player_c_id;

    // Validate player not already in another pair for this contest
    for (const playerId of [player_a_id, player_b_id, player_c_id].filter(Boolean)) {
      // Get all team IDs for this contest
      const { data: contestTeams } = await adminClient
        .from("ryder_cup_teams")
        .select("id")
        .eq("contest_id", team.contest_id);

      const contestTeamIds = (contestTeams || []).map((t) => t.id);

      const { data: existingPairs } = await adminClient
        .from("ryder_cup_pairs")
        .select("id, player_a_id, player_b_id, player_c_id")
        .in("team_id", contestTeamIds);

      for (const ep of existingPairs || []) {
        if (ep.id === pair_id) continue;
        if (ep.player_a_id === playerId || ep.player_b_id === playerId || ep.player_c_id === playerId) {
          return NextResponse.json(
            { error: "Player is already assigned to another pair" },
            { status: 400 }
          );
        }
      }
    }

    const { error } = await adminClient
      .from("ryder_cup_pairs")
      .update(updates)
      .eq("id", pair_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update ryder cup pair error:", error);
    return NextResponse.json({ error: "Failed to update pair" }, { status: 500 });
  }
}

// DELETE - Delete a pair (blocks if in a foursome)
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { pair_id } = await request.json();

    if (!pair_id) {
      return NextResponse.json({ error: "pair_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("ryder_cup_pairs")
      .delete()
      .eq("id", pair_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete ryder cup pair error:", error);
    return NextResponse.json({ error: "Failed to delete pair" }, { status: 500 });
  }
}
