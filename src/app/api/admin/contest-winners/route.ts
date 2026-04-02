import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import {
  resolveWinnersForPrize,
  manuallyResolveWinners,
  clearWinnersForPrize,
} from "@/lib/winners/resolve";

// GET - Fetch all prizes with winner status for a trip's calcutta
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_calcutta");
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

    // Fetch prizes with linked contest info
    const { data: prizes, error: prizeErr } = await adminClient
      .from("calcutta_prizes")
      .select("*, linked_contest:contests!calcutta_prizes_linked_contest_id_fkey(id, name, contest_type, verified_at, winners_locked_at)")
      .eq("contest_id", contestId)
      .order("sort_order", { ascending: true });

    if (prizeErr) {
      return NextResponse.json({ error: prizeErr.message }, { status: 500 });
    }

    // Fetch all winners
    const prizeIds = (prizes || []).map((p) => p.id);
    const { data: winners } = await adminClient
      .from("contest_winners")
      .select("*, user:users!contest_winners_user_id_fkey(id, display_name, avatar_url)")
      .in("prize_id", prizeIds.length > 0 ? prizeIds : ["__none__"]);

    // Fetch pool
    const { data: participants } = await adminClient
      .from("contest_participants")
      .select("bid_amount")
      .eq("contest_id", contestId)
      .not("bid_amount", "is", null);

    const pool = (participants || []).reduce((sum, p) => sum + (Number(p.bid_amount) || 0), 0);

    // Group winners by prize_id
    const winnersByPrize: Record<string, NonNullable<typeof winners>> = {};
    for (const w of winners || []) {
      if (!winnersByPrize[w.prize_id]) winnersByPrize[w.prize_id] = [];
      winnersByPrize[w.prize_id].push(w);
    }

    const result = (prizes || []).map((p) => ({
      ...p,
      winners: winnersByPrize[p.id] || [],
      total_payout: pool * p.percentage / 100,
    }));

    return NextResponse.json({ prizes: result, pool });
  } catch (error) {
    console.error("Fetch contest winners error:", error);
    return NextResponse.json({ error: "Failed to fetch winners" }, { status: 500 });
  }
}

// POST - Resolve winners for a prize (auto or manual)
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_calcutta");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { prize_id, action, winner_user_ids, notes } = await request.json();

    if (!prize_id || !action) {
      return NextResponse.json({ error: "prize_id and action are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    if (action === "auto") {
      const result = await resolveWinnersForPrize(adminClient, prize_id, admin.id);

      if (result.tied) {
        return NextResponse.json(
          { error: "Tie detected — admin must declare winner", tied: true, tiedUserIds: result.tiedUserIds, tiedPoints: result.tiedPoints },
          { status: 409 }
        );
      }

      if (!result.resolved) {
        return NextResponse.json(
          { error: result.error || "Could not resolve winners" },
          { status: 422 }
        );
      }

      return NextResponse.json({ success: true, winnerUserIds: result.winnerUserIds });
    }

    if (action === "manual") {
      if (!winner_user_ids || !Array.isArray(winner_user_ids) || winner_user_ids.length === 0) {
        return NextResponse.json({ error: "winner_user_ids required for manual resolution" }, { status: 400 });
      }

      const result = await manuallyResolveWinners(adminClient, prize_id, winner_user_ids, admin.id, notes);

      if (!result.resolved) {
        return NextResponse.json({ error: result.error || "Failed to set winners" }, { status: 500 });
      }

      return NextResponse.json({ success: true, winnerUserIds: result.winnerUserIds });
    }

    return NextResponse.json({ error: "Invalid action. Use 'auto' or 'manual'." }, { status: 400 });
  } catch (error) {
    console.error("Resolve contest winners error:", error);
    return NextResponse.json({ error: "Failed to resolve winners" }, { status: 500 });
  }
}

// DELETE - Clear winners for a prize
export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_calcutta");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { prize_id } = await request.json();

    if (!prize_id) {
      return NextResponse.json({ error: "prize_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    await clearWinnersForPrize(adminClient, prize_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clear contest winners error:", error);
    return NextResponse.json({ error: "Failed to clear winners" }, { status: 500 });
  }
}
