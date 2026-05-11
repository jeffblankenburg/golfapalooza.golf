import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { getPickemEntryFee } from "@/lib/pickem/entry-fee";

// GET - Fetch all games for a contest, plus settings and participants
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

    // Get trip_id so we can use event_participants
    const { data: contestRow } = await adminClient
      .from("contests")
      .select("trip_id")
      .eq("id", contestId)
      .single();

    const tripId = contestRow?.trip_id;

    const [gamesRes, settingsRes, entryFeeRes, contestSplitsRes, participantsRes, picksRes] = await Promise.all([
      adminClient
        .from("pickem_games")
        .select("*")
        .eq("contest_id", contestId)
        .order("sort_order")
        .order("game_time"),
      adminClient
        .from("pickem_settings")
        .select("contest_id, is_open")
        .eq("contest_id", contestId)
        .maybeSingle(),
      // Issue #125 Phase 4: entry fee derives from contests.buy_in_cost_item_id.
      getPickemEntryFee(adminClient, contestId),
      // Issue #124: payout structure now lives on contests.payout_splits.
      adminClient
        .from("contests")
        .select("payout_splits")
        .eq("id", contestId)
        .single(),
      // Pickem participants come from the contest's roster (issue #124).
      // contest_participants is auto-populated when a Loozer selects the
      // funding option, and Whitey can add/remove via the accordion.
      adminClient
        .from("contest_participants")
        .select("user_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url)")
        .eq("contest_id", contestId),
      adminClient
        .from("pickem_picks")
        .select("game_id, user_id, picked_team, tiebreaker_total"),
    ]);

    // Filter picks to only those for games in this contest
    const gameIds = new Set((gamesRes.data || []).map((g) => g.id));
    const contestPicks = (picksRes.data || []).filter((p) => gameIds.has(p.game_id));

    // Get payment status
    const { data: payments } = await adminClient
      .from("pickem_payments")
      .select("user_id, paid, paid_at")
      .eq("contest_id", contestId);

    const participants = (participantsRes.data || []).map((p) => {
      const user = Array.isArray(p.user) ? p.user[0] : p.user;
      return {
        user_id: p.user_id,
        display_name: user?.display_name || "Unknown",
        full_name: user?.full_name || null,
        avatar_url: user?.avatar_url || null,
      };
    });

    // Translate contests.payout_splits → the legacy {place, percentage}
    // shape the PickemManager UI still consumes. Caller doesn't need to
    // know the structure moved.
    type Split = { place: number; kind: string; amount?: number };
    const splits = (contestSplitsRes.data?.payout_splits || []) as Split[];
    const payout_json = splits
      .filter((s) => s.kind === "percentage")
      .map((s) => ({ place: Number(s.place), percentage: Number(s.amount ?? 0) }));

    const settings = {
      contest_id: contestId,
      entry_fee: entryFeeRes.entry_fee,
      cost_item_id: entryFeeRes.cost_item_id,
      is_open: settingsRes.data?.is_open ?? false,
      payout_json,
    };

    return NextResponse.json({
      games: gamesRes.data || [],
      settings,
      participants,
      picks: contestPicks,
      payments: payments || [],
    });
  } catch (error) {
    console.error("Get pickem data error:", error);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}

// POST - Create a new game
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { contest_id, away_team, home_team, spread, favorite, game_time, tv_channel, away_logo_url, home_logo_url, away_color, home_color, is_tiebreaker } = body;

    if (!contest_id || !away_team || !home_team || spread === undefined || !favorite || !game_time) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // If setting as tiebreaker, clear existing tiebreaker
    if (is_tiebreaker) {
      await adminClient
        .from("pickem_games")
        .update({ is_tiebreaker: false })
        .eq("contest_id", contest_id)
        .eq("is_tiebreaker", true);
    }

    // Get next sort_order
    const { data: existing } = await adminClient
      .from("pickem_games")
      .select("sort_order")
      .eq("contest_id", contest_id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data: game, error } = await adminClient
      .from("pickem_games")
      .insert({
        contest_id,
        away_team: away_team.trim(),
        home_team: home_team.trim(),
        spread: parseFloat(spread),
        favorite,
        game_time,
        tv_channel: tv_channel?.trim() || null,
        away_logo_url: away_logo_url?.trim() || null,
        home_logo_url: home_logo_url?.trim() || null,
        away_color: away_color?.trim() || null,
        home_color: home_color?.trim() || null,
        is_tiebreaker: is_tiebreaker || false,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ game });
  } catch (error) {
    console.error("Create pickem game error:", error);
    return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
  }
}

// PUT - Update a game
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // If setting as tiebreaker, clear existing tiebreaker first
    if (updates.is_tiebreaker) {
      const { data: game } = await adminClient
        .from("pickem_games")
        .select("contest_id")
        .eq("id", id)
        .single();

      if (game) {
        await adminClient
          .from("pickem_games")
          .update({ is_tiebreaker: false })
          .eq("contest_id", game.contest_id)
          .eq("is_tiebreaker", true);
      }
    }

    // Clean up string fields
    const cleanUpdates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (typeof val === "string" && ["away_team", "home_team", "tv_channel", "away_logo_url", "home_logo_url"].includes(key)) {
        cleanUpdates[key] = val.trim() || null;
      } else if (key === "spread") {
        cleanUpdates[key] = parseFloat(val as string);
      } else {
        cleanUpdates[key] = val;
      }
    }

    const { error } = await adminClient
      .from("pickem_games")
      .update(cleanUpdates)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update pickem game error:", error);
    return NextResponse.json({ error: "Failed to update game" }, { status: 500 });
  }
}

// DELETE - Delete a game
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("pickem_games")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete pickem game error:", error);
    return NextResponse.json({ error: "Failed to delete game" }, { status: 500 });
  }
}
