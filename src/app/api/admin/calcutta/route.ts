import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

// GET - Fetch all calcutta data for a contest
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

    // Fetch contest
    const { data: contest } = await adminClient
      .from("contests")
      .select("id, calcutta_active_order, trip_id")
      .eq("id", contestId)
      .single();

    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    // Fetch participants with user and owner details
    const { data: participants, error: partError } = await adminClient
      .from("contest_participants")
      .select("id, user_id, auction_order, bid_amount, owner_id, sold_at, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url, birthday), owner:users!contest_participants_owner_id_fkey(id, display_name, avatar_url)")
      .eq("contest_id", contestId)
      .order("auction_order", { nullsFirst: false });

    if (partError) {
      return NextResponse.json({ error: partError.message }, { status: 500 });
    }

    // Auto-assign auction_order to participants that don't have one
    const withOrder = (participants || []).filter((p) => p.auction_order != null);
    const withoutOrder = (participants || []).filter((p) => p.auction_order == null);
    let maxOrder = withOrder.length > 0 ? Math.max(...withOrder.map((p) => p.auction_order!)) : 0;

    if (withoutOrder.length > 0) {
      await Promise.all(
        withoutOrder.map((p, i) => {
          const order = maxOrder + i + 1;
          p.auction_order = order;
          return adminClient
            .from("contest_participants")
            .update({ auction_order: order })
            .eq("id", p.id);
        })
      );
      maxOrder += withoutOrder.length;
    }

    // Sort by auction_order
    const sorted = (participants || []).sort((a, b) => (a.auction_order || 999) - (b.auction_order || 999));

    // Fetch prizes with linked contest name
    const { data: prizes, error: prizesError } = await adminClient
      .from("calcutta_prizes")
      .select("*, linked_contest:contests!calcutta_prizes_linked_contest_id_fkey(id, name, contest_type)")
      .eq("contest_id", contestId)
      .order("sort_order");

    if (prizesError) {
      return NextResponse.json({ error: prizesError.message }, { status: 500 });
    }

    // All contests in the trip (for prize contest selection dropdown)
    const { data: tripContests } = await adminClient
      .from("contests")
      .select("id, name, contest_type, day_number, sort_order")
      .eq("trip_id", contest.trip_id)
      .neq("id", contestId)  // exclude the calcutta contest itself
      .order("sort_order");

    // All event participants (for owner/buyer selection)
    const { data: allParticipants } = await adminClient
      .from("event_participants")
      .select("user_id, user:users(id, display_name, avatar_url)")
      .eq("trip_id", contest.trip_id);

    const allUsers = (allParticipants || []).map((p) => {
      const user = Array.isArray(p.user) ? p.user[0] : p.user;
      return {
        user_id: p.user_id,
        display_name: user?.display_name || "Unknown",
        avatar_url: user?.avatar_url || null,
      };
    });

    // Normalize participants
    const normalizedParticipants = sorted.map((p) => {
      const user = Array.isArray(p.user) ? p.user[0] : p.user;
      const owner = Array.isArray(p.owner) ? p.owner[0] : p.owner;
      return {
        id: p.id,
        user_id: p.user_id,
        auction_order: p.auction_order,
        bid_amount: p.bid_amount,
        sold_at: p.sold_at,
        owner_id: p.owner_id,
        user: user ? {
          id: user.id,
          display_name: user.display_name,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
          birthday: user.birthday,
        } : null,
        owner: owner ? {
          id: owner.id,
          display_name: owner.display_name,
          avatar_url: owner.avatar_url,
        } : null,
      };
    });

    // Normalize prizes
    const normalizedPrizes = (prizes || []).map((p) => {
      const lc = Array.isArray(p.linked_contest) ? p.linked_contest[0] : p.linked_contest;
      return {
        id: p.id,
        contest_id: p.contest_id,
        linked_contest_id: p.linked_contest_id,
        prize_name: p.prize_name,
        place: p.place,
        percentage: p.percentage,
        sort_order: p.sort_order,
        per_player: p.per_player ?? false,
        player_count: p.player_count ?? 1,
        linked_contest: lc ? { id: lc.id, name: lc.name, contest_type: lc.contest_type } : null,
      };
    });

    return NextResponse.json({
      participants: normalizedParticipants,
      prizes: normalizedPrizes,
      active_order: contest.calcutta_active_order,
      allUsers,
      tripContests: tripContests || [],
    });
  } catch (error) {
    console.error("Get calcutta error:", error);
    return NextResponse.json({ error: "Failed to load calcutta data" }, { status: 500 });
  }
}

// PUT - Reorder participants, record a bid, or set active
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const adminClient = createAdminClient();

    // Action: reorder
    if (body.action === "reorder") {
      // order is an array of { id, auction_order }
      const results = await Promise.all(
        body.order.map((item: { id: string; auction_order: number }) =>
          adminClient
            .from("contest_participants")
            .update({ auction_order: item.auction_order })
            .eq("id", item.id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        return NextResponse.json({ error: failed.error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    // Action: record bid
    if (body.action === "bid") {
      const { participant_id, bid_amount, owner_id } = body;
      if (!participant_id) {
        return NextResponse.json({ error: "participant_id is required" }, { status: 400 });
      }

      const { error } = await adminClient
        .from("contest_participants")
        .update({
          bid_amount,
          owner_id: owner_id || null,
          sold_at: bid_amount != null ? new Date().toISOString() : null,
        })
        .eq("id", participant_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Action: set active auction order
    if (body.action === "set_active") {
      const { contest_id, active_order } = body;
      if (!contest_id) {
        return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
      }

      const { error } = await adminClient
        .from("contests")
        .update({ calcutta_active_order: active_order })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Action: reset auction (clear all bids, owners, sold_at, and active_order)
    if (body.action === "reset") {
      const { contest_id } = body;
      if (!contest_id) {
        return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
      }

      const { error: resetError } = await adminClient
        .from("contest_participants")
        .update({ bid_amount: null, owner_id: null, sold_at: null })
        .eq("contest_id", contest_id);

      if (resetError) {
        return NextResponse.json({ error: resetError.message }, { status: 500 });
      }

      const { error: activeError } = await adminClient
        .from("contests")
        .update({ calcutta_active_order: null })
        .eq("id", contest_id);

      if (activeError) {
        return NextResponse.json({ error: activeError.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Action: end auction (placeholder for future use)
    if (body.action === "end_auction") {
      const { contest_id } = body;
      if (!contest_id) {
        return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
      }

      // Set active_order to null to signal auction is over
      const { error } = await adminClient
        .from("contests")
        .update({ calcutta_active_order: null })
        .eq("id", contest_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Update calcutta error:", error);
    return NextResponse.json({ error: "Failed to update calcutta" }, { status: 500 });
  }
}
