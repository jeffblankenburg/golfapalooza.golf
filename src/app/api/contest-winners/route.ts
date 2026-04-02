import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/contest-winners?trip_id=
 * Returns all calcutta prizes with resolved winners and computed payouts.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  try {
    // Find the calcutta contest for this trip
    const { data: calcuttaContest } = await supabase
      .from("contests")
      .select("id")
      .eq("trip_id", tripId)
      .eq("contest_type", "calcutta")
      .single();

    if (!calcuttaContest) {
      return NextResponse.json({ prizes: [], pool: 0 });
    }

    // Calculate pool
    const { data: participants } = await supabase
      .from("contest_participants")
      .select("bid_amount")
      .eq("contest_id", calcuttaContest.id)
      .not("bid_amount", "is", null);

    const pool = (participants || []).reduce((sum, p) => sum + (Number(p.bid_amount) || 0), 0);

    // Fetch prizes with linked contest info
    const { data: prizes, error: prizeErr } = await supabase
      .from("calcutta_prizes")
      .select("id, prize_name, place, percentage, per_player, player_count, resolution_type, linked_contest:contests!calcutta_prizes_linked_contest_id_fkey(id, name, contest_type, verified_at)")
      .eq("contest_id", calcuttaContest.id)
      .order("sort_order", { ascending: true });

    if (prizeErr) {
      return NextResponse.json({ error: prizeErr.message }, { status: 500 });
    }

    if (!prizes || prizes.length === 0) {
      return NextResponse.json({ prizes: [], pool });
    }

    // Fetch all winners with user info
    const prizeIds = prizes.map((p) => p.id);
    const { data: winners } = await supabase
      .from("contest_winners")
      .select("prize_id, user_id, place, is_playoff, notes, user:users!contest_winners_user_id_fkey(id, display_name, avatar_url)")
      .in("prize_id", prizeIds);

    // Fetch ownership for payout computation
    const { data: ownership } = await supabase
      .from("calcutta_ownership")
      .select("owner_id, share_pct, participant:contest_participants!inner(user_id)")
      .eq("participant.contest_id", calcuttaContest.id);

    // Fetch owner display names
    const ownerIds = [...new Set((ownership || []).map((o) => o.owner_id))];
    const { data: ownerUsers } = await supabase
      .from("users")
      .select("id, display_name, avatar_url")
      .in("id", ownerIds.length > 0 ? ownerIds : ["__none__"]);

    const ownerNameMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
    for (const u of ownerUsers || []) {
      ownerNameMap[u.id] = { display_name: u.display_name, avatar_url: u.avatar_url };
    }

    // Build ownership lookup: user_id -> [{ owner_id, share_pct }]
    const ownershipByUser: Record<string, { owner_id: string; share_pct: number }[]> = {};
    for (const o of ownership || []) {
      const participant = Array.isArray(o.participant) ? o.participant[0] : o.participant;
      const userId = participant?.user_id;
      if (!userId) continue;
      if (!ownershipByUser[userId]) ownershipByUser[userId] = [];
      ownershipByUser[userId].push({ owner_id: o.owner_id, share_pct: o.share_pct });
    }

    // Group winners by prize_id
    const winnersByPrize: Record<string, NonNullable<typeof winners>> = {};
    for (const w of winners || []) {
      if (!winnersByPrize[w.prize_id]) winnersByPrize[w.prize_id] = [];
      winnersByPrize[w.prize_id].push(w);
    }

    // Build response
    const result = prizes.map((prize) => {
      const prizeWinners = winnersByPrize[prize.id] || [];
      const totalPayout = pool * prize.percentage / 100;
      const winnerCount = prizeWinners.length || 1;
      const perPlayerPayout = totalPayout / winnerCount;

      const linkedContest = Array.isArray(prize.linked_contest)
        ? prize.linked_contest[0]
        : prize.linked_contest;

      const displayName = prize.prize_name || linkedContest?.name || "Prize";

      return {
        prize_id: prize.id,
        prize_name: displayName,
        place: prize.place,
        percentage: prize.percentage,
        per_player: prize.per_player,
        player_count: prize.player_count,
        resolution_type: prize.resolution_type,
        total_payout: totalPayout,
        per_player_payout: perPlayerPayout,
        resolved: prizeWinners.length > 0,
        linked_contest: linkedContest ? {
          id: linkedContest.id,
          name: linkedContest.name,
          verified: !!linkedContest.verified_at,
        } : null,
        winners: prizeWinners.map((w) => {
          const winnerUser = Array.isArray(w.user) ? w.user[0] : w.user;
          const userOwnership = ownershipByUser[w.user_id] || [];

          return {
            user_id: w.user_id,
            display_name: winnerUser?.display_name || "Unknown",
            avatar_url: winnerUser?.avatar_url || null,
            is_playoff: w.is_playoff,
            notes: w.notes,
            owners: userOwnership.map((o) => ({
              owner_id: o.owner_id,
              display_name: ownerNameMap[o.owner_id]?.display_name || "Unknown",
              avatar_url: ownerNameMap[o.owner_id]?.avatar_url || null,
              share_pct: o.share_pct,
              owner_payout: perPlayerPayout * (o.share_pct / 100),
            })),
          };
        }),
      };
    });

    return NextResponse.json({ prizes: result, pool });
  } catch (error) {
    console.error("Contest winners error:", error);
    return NextResponse.json({ error: "Failed to fetch winners" }, { status: 500 });
  }
}
