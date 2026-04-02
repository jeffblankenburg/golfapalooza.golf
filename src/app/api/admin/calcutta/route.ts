import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Fetch all calcutta data for a contest
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

    // Fetch ownership records for all participants
    const participantIds = (participants || []).map((p) => p.id);
    const { data: ownershipRows } = participantIds.length > 0
      ? await adminClient
          .from("calcutta_ownership")
          .select("id, participant_id, owner_id, share_pct, amount_paid, is_buyback, owner:users!calcutta_ownership_owner_id_fkey(id, display_name, avatar_url)")
          .in("participant_id", participantIds)
      : { data: [] };

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

    // Build ownership map by participant_id
    const ownershipMap = new Map<string, typeof ownershipRows>();
    for (const row of ownershipRows || []) {
      const list = ownershipMap.get(row.participant_id) || [];
      list.push(row);
      ownershipMap.set(row.participant_id, list);
    }

    // Normalize participants
    const normalizedParticipants = sorted.map((p) => {
      const user = Array.isArray(p.user) ? p.user[0] : p.user;
      const owner = Array.isArray(p.owner) ? p.owner[0] : p.owner;
      const ownerships = (ownershipMap.get(p.id) || []).map((o) => {
        const oUser = Array.isArray(o.owner) ? o.owner[0] : o.owner;
        return {
          id: o.id,
          owner_id: o.owner_id,
          share_pct: o.share_pct,
          amount_paid: o.amount_paid,
          is_buyback: o.is_buyback,
          owner: oUser ? { id: oUser.id, display_name: oUser.display_name, avatar_url: oUser.avatar_url } : null,
        };
      });
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
        ownerships,
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

    // Fetch buyer payment status
    const { data: paidRows } = await adminClient
      .from("calcutta_buyer_paid")
      .select("user_id")
      .eq("contest_id", contestId);
    const paidBuyers = new Set((paidRows || []).map((r) => r.user_id));

    return NextResponse.json({
      participants: normalizedParticipants,
      prizes: normalizedPrizes,
      active_order: contest.calcutta_active_order,
      allUsers,
      tripContests: tripContests || [],
      paidBuyers: Array.from(paidBuyers),
    });
  } catch (error) {
    console.error("Get calcutta error:", error);
    return NextResponse.json({ error: "Failed to load calcutta data" }, { status: 500 });
  }
}

// PUT - Reorder participants, record a bid, or set active
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_calcutta");
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
      const { participant_id, bid_amount, owner_id, buyback } = body;
      if (!participant_id) {
        return NextResponse.json({ error: "participant_id is required" }, { status: 400 });
      }

      // Get the participant's user_id for buyback
      const { data: participant } = await adminClient
        .from("contest_participants")
        .select("user_id")
        .eq("id", participant_id)
        .single();

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

      // Sync ownership: clear existing and create ownership records
      await adminClient
        .from("calcutta_ownership")
        .delete()
        .eq("participant_id", participant_id);

      if (owner_id && bid_amount != null) {
        if (buyback && participant) {
          // Split 50/50: buyer gets half, player gets half
          const halfAmount = Number(bid_amount) / 2;
          await adminClient
            .from("calcutta_ownership")
            .insert([
              {
                participant_id,
                owner_id,
                share_pct: 50,
                amount_paid: halfAmount,
                is_buyback: false,
              },
              {
                participant_id,
                owner_id: participant.user_id,
                share_pct: 50,
                amount_paid: halfAmount,
                is_buyback: true,
              },
            ]);
        } else {
          await adminClient
            .from("calcutta_ownership")
            .insert({
              participant_id,
              owner_id,
              share_pct: 100,
              amount_paid: bid_amount,
              is_buyback: false,
            });
        }
      }

      return NextResponse.json({ success: true });
    }

    // Action: toggle buyback on an already-sold participant
    if (body.action === "buyback") {
      const { participant_id } = body;
      if (!participant_id) {
        return NextResponse.json({ error: "participant_id is required" }, { status: 400 });
      }

      const { data: participant } = await adminClient
        .from("contest_participants")
        .select("id, user_id, bid_amount, owner_id")
        .eq("id", participant_id)
        .single();

      if (!participant || !participant.bid_amount || !participant.owner_id) {
        return NextResponse.json({ error: "Participant must be sold first" }, { status: 400 });
      }

      const halfAmount = Number(participant.bid_amount) / 2;

      await adminClient
        .from("calcutta_ownership")
        .delete()
        .eq("participant_id", participant_id);

      await adminClient
        .from("calcutta_ownership")
        .insert([
          {
            participant_id,
            owner_id: participant.owner_id,
            share_pct: 50,
            amount_paid: halfAmount,
            is_buyback: false,
          },
          {
            participant_id,
            owner_id: participant.user_id,
            share_pct: 50,
            amount_paid: halfAmount,
            is_buyback: true,
          },
        ]);

      return NextResponse.json({ success: true });
    }

    // Action: undo buyback (revert to single 100% owner)
    if (body.action === "undo_buyback") {
      const { participant_id } = body;
      if (!participant_id) {
        return NextResponse.json({ error: "participant_id is required" }, { status: 400 });
      }

      const { data: participant } = await adminClient
        .from("contest_participants")
        .select("id, bid_amount, owner_id")
        .eq("id", participant_id)
        .single();

      if (!participant || !participant.bid_amount || !participant.owner_id) {
        return NextResponse.json({ error: "Participant must be sold first" }, { status: 400 });
      }

      await adminClient
        .from("calcutta_ownership")
        .delete()
        .eq("participant_id", participant_id);

      await adminClient
        .from("calcutta_ownership")
        .insert({
          participant_id,
          owner_id: participant.owner_id,
          share_pct: 100,
          amount_paid: Number(participant.bid_amount),
          is_buyback: false,
        });

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

    // Action: reset auction (clear all bids, owners, sold_at, ownership, and active_order)
    if (body.action === "reset") {
      const { contest_id } = body;
      if (!contest_id) {
        return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
      }

      // Clear ownership records for all participants in this contest
      const { data: contestParticipants } = await adminClient
        .from("contest_participants")
        .select("id")
        .eq("contest_id", contest_id);
      const pIds = (contestParticipants || []).map((p) => p.id);
      if (pIds.length > 0) {
        await adminClient
          .from("calcutta_ownership")
          .delete()
          .in("participant_id", pIds);
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

    // Action: toggle buyer paid status
    if (body.action === "toggle_paid") {
      const { contest_id, user_id } = body;
      if (!contest_id || !user_id) {
        return NextResponse.json({ error: "contest_id and user_id are required" }, { status: 400 });
      }

      // Check if already paid
      const { data: existing } = await adminClient
        .from("calcutta_buyer_paid")
        .select("id")
        .eq("contest_id", contest_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        await adminClient
          .from("calcutta_buyer_paid")
          .delete()
          .eq("id", existing.id);
      } else {
        await adminClient
          .from("calcutta_buyer_paid")
          .insert({ contest_id, user_id });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("Update calcutta error:", error);
    return NextResponse.json({ error: "Failed to update calcutta" }, { status: 500 });
  }
}
