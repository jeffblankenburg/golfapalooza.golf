import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveDate, getEffectiveUserId } from "@/lib/simulator";
import { getPickemEntryFee } from "@/lib/pickem/entry-fee";
import { fetchContestPicks } from "@/lib/pickem/picks";

// GET - Fetch games, user's picks, and leaderboard
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();
    const now = await getEffectiveDate();

    // Fetch games, all picks, participants, and settings in parallel
    // Get trip_id for this contest so we can use event_participants
    const { data: contestRow } = await adminClient
      .from("contests")
      .select("trip_id")
      .eq("id", contestId)
      .single();

    const tripId = contestRow?.trip_id;

    const [gamesRes, contestPicks, participantsRes, entryFeeRes, contestSplitsRes] = await Promise.all([
      adminClient
        .from("pickem_games")
        .select("*")
        .eq("contest_id", contestId)
        .order("game_time")
        .order("sort_order"),
      fetchContestPicks(adminClient, contestId),
      adminClient
        .from("event_participants")
        .select("user_id, user:users!event_participants_user_id_fkey(id, display_name, full_name, avatar_url)")
        .eq("trip_id", tripId),
      // Issue #125 Phase 4: entry fee derives from contests.buy_in_cost_item_id.
      getPickemEntryFee(adminClient, contestId),
      // Issue #124: payout structure now lives on contests.payout_splits.
      adminClient
        .from("contests")
        .select("payout_splits")
        .eq("id", contestId)
        .single(),
    ]);

    const games = gamesRes.data || [];
    // contestPicks is already scoped to this contest by fetchContestPicks.

    // User's own picks (always visible)
    const myPicks = contestPicks.filter((p) => p.user_id === effectiveUserId);

    // All picks lock when the earliest game starts
    const earliestGameTime = games.reduce((earliest, game) => {
      const t = new Date(game.game_time);
      return t < earliest ? t : earliest;
    }, new Date("9999-01-01"));
    const allLocked = now >= earliestGameTime;

    // Build game data with lock status
    const gamesWithStatus = games.map((game) => {
      const isLocked = allLocked;

      return {
        id: game.id,
        away_team: game.away_team,
        home_team: game.home_team,
        away_logo_url: game.away_logo_url,
        home_logo_url: game.home_logo_url,
        away_color: game.away_color,
        home_color: game.home_color,
        spread: game.spread,
        favorite: game.favorite,
        game_time: game.game_time,
        tv_channel: game.tv_channel,
        is_tiebreaker: game.is_tiebreaker,
        winning_team: game.winning_team,
        away_score: game.away_score,
        home_score: game.home_score,
        is_locked: isLocked,
      };
    });

    // Build leaderboard
    const allGamesLocked = allLocked;

    // Find tiebreaker game actual total
    const tiebreakerGame = games.find((g) => g.is_tiebreaker);
    const tiebreakerActualTotal =
      tiebreakerGame && tiebreakerGame.away_score !== null && tiebreakerGame.home_score !== null
        ? tiebreakerGame.away_score + tiebreakerGame.home_score
        : null;

    // Fetch payments to filter leaderboard
    const { data: paymentsData } = await adminClient
      .from("pickem_payments")
      .select("user_id, paid")
      .eq("contest_id", contestId);
    const paidUserIds = new Set(
      (paymentsData || []).filter((p) => p.paid).map((p) => p.user_id)
    );

    const participants = (participantsRes.data || []).map((p) => {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      return {
        user_id: p.user_id,
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
      };
    });

    // Leaderboard only includes people who made picks AND paid
    const eligibleParticipants = participants.filter((p) => {
      const hasPicks = contestPicks.some((pk) => pk.user_id === p.user_id);
      const hasPaid = paidUserIds.has(p.user_id);
      return hasPicks && hasPaid;
    });

    const leaderboard = eligibleParticipants.map((p) => {
      const userPicks = contestPicks.filter((pk) => pk.user_id === p.user_id);
      let correct = 0;
      let decided = 0;
      let tiebreakerTotal: number | null = null;

      for (const game of games) {
        const pick = userPicks.find((pk) => pk.game_id === game.id);
        if (!pick) continue;

        if (game.is_tiebreaker && pick.tiebreaker_total !== null) {
          tiebreakerTotal = pick.tiebreaker_total;
        }

        if (game.winning_team && game.away_score !== null && game.home_score !== null) {
          decided++;
          const margin = game.home_score - game.away_score;
          const homeSpread = game.favorite === "home" ? game.spread : -game.spread;
          const homeCovers = margin + homeSpread > 0;
          const isCorrect = pick.picked_team === "home" ? homeCovers : !homeCovers;
          if (isCorrect) correct++;
        }
      }

      const tiebreakerDiff =
        tiebreakerTotal !== null && tiebreakerActualTotal !== null
          ? Math.abs(tiebreakerTotal - tiebreakerActualTotal)
          : null;

      return {
        user_id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        picks_count: userPicks.length,
        correct,
        decided,
        tiebreaker_total: tiebreakerTotal,
        tiebreaker_diff: tiebreakerDiff,
        // Only show picks if all games are locked
        picks: allGamesLocked
          ? userPicks.map((pk) => ({ game_id: pk.game_id, picked_team: pk.picked_team }))
          : undefined,
      };
    });

    // Sort leaderboard
    leaderboard.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      if (a.tiebreaker_diff !== null && b.tiebreaker_diff !== null) {
        return a.tiebreaker_diff - b.tiebreaker_diff;
      }
      if (a.tiebreaker_diff !== null) return -1;
      if (b.tiebreaker_diff !== null) return 1;
      return 0;
    });

    // Assign ranks
    let rank = 1;
    for (let i = 0; i < leaderboard.length; i++) {
      if (i > 0) {
        const prev = leaderboard[i - 1];
        const curr = leaderboard[i];
        if (curr.correct !== prev.correct || curr.tiebreaker_diff !== prev.tiebreaker_diff) {
          rank = i + 1;
        }
      }
      (leaderboard[i] as Record<string, unknown>).rank = rank;
    }

    // Check if current user has paid + total paid count for pot math.
    const [myPaymentRes, paidCountRes] = await Promise.all([
      adminClient
        .from("pickem_payments")
        .select("paid")
        .eq("contest_id", contestId)
        .eq("user_id", effectiveUserId)
        .single(),
      adminClient
        .from("pickem_payments")
        .select("id", { count: "exact", head: true })
        .eq("contest_id", contestId)
        .eq("paid", true),
    ]);
    const myPayment = myPaymentRes.data;
    const paidCount = paidCountRes.count ?? 0;

    return NextResponse.json({
      games: gamesWithStatus,
      my_picks: myPicks,
      leaderboard,
      settings: (() => {
        type Split = { place: number; kind: string; amount?: number };
        const splits = (contestSplitsRes.data?.payout_splits || []) as Split[];
        const payout_json = splits
          .filter((s) => s.kind === "percentage")
          .map((s) => ({ place: Number(s.place), percentage: Number(s.amount ?? 0) }));
        return {
          contest_id: contestId,
          entry_fee: entryFeeRes.entry_fee,
          payout_json,
        };
      })(),
      effective_user_id: effectiveUserId,
      has_paid: myPayment?.paid || false,
      paid_count: paidCount,
    });
  } catch (error) {
    console.error("Get pickem data error:", error);
    return NextResponse.json({ error: "Failed to load data" }, { status: 500 });
  }
}

// POST - Submit/update a pick (auto-save)
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const { game_id, picked_team, tiebreaker_total } = await request.json();

    if (!game_id || !picked_team || !["away", "home"].includes(picked_team)) {
      return NextResponse.json({ error: "Invalid pick" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const now = await getEffectiveDate();

    // Verify game exists
    const { data: game } = await adminClient
      .from("pickem_games")
      .select("id, game_time, contest_id")
      .eq("id", game_id)
      .single();

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // All picks lock when the earliest game in the contest starts
    const { data: allGames } = await adminClient
      .from("pickem_games")
      .select("game_time")
      .eq("contest_id", game.contest_id)
      .order("game_time")
      .limit(1);

    const earliestTime = allGames?.[0] ? new Date(allGames[0].game_time) : new Date(game.game_time);
    if (now >= earliestTime) {
      return NextResponse.json({ error: "Game is locked" }, { status: 400 });
    }

    // Verify user is an event participant (any trip participant can play pick'em)
    const { data: contest } = await adminClient
      .from("contests")
      .select("trip_id")
      .eq("id", game.contest_id)
      .single();

    const { data: participant } = await adminClient
      .from("event_participants")
      .select("id")
      .eq("trip_id", contest?.trip_id)
      .eq("user_id", effectiveUserId)
      .single();

    if (!participant) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    // Upsert pick
    const { error } = await adminClient
      .from("pickem_picks")
      .upsert(
        {
          game_id,
          user_id: effectiveUserId,
          picked_team,
          tiebreaker_total: tiebreaker_total !== undefined ? tiebreaker_total : null,
        },
        { onConflict: "game_id,user_id" }
      );

    // Anyone who makes a pick auto-enrolls in contest_participants so
    // Whitey can see them in the Payments tab and chase the entry fee.
    // Paid status stays untouched — they're not on the leaderboard until
    // Whitey marks them paid (which requires real money to come in).
    await adminClient
      .from("contest_participants")
      .upsert(
        { contest_id: game.contest_id, user_id: effectiveUserId },
        { onConflict: "contest_id,user_id" },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Submit pickem pick error:", error);
    return NextResponse.json({ error: "Failed to save pick" }, { status: 500 });
  }
}
