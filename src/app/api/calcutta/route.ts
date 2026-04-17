import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - Public display data for the Calcutta auction
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

    // Fetch contest
    const { data: contest } = await adminClient
      .from("contests")
      .select("id, name, calcutta_active_order, trip_id")
      .eq("id", contestId)
      .single();

    if (!contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    // Fetch participants with user and owner
    const { data: participants } = await adminClient
      .from("contest_participants")
      .select("id, user_id, auction_order, bid_amount, sold_at, owner_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url, birthday), owner:users!contest_participants_owner_id_fkey(id, display_name, avatar_url)")
      .eq("contest_id", contestId)
      .order("auction_order", { nullsFirst: false });

    // Fetch prizes with linked contest name
    const { data: rawPrizes } = await adminClient
      .from("calcutta_prizes")
      .select("id, prize_name, place, percentage, sort_order, per_player, player_count, linked_contest_id, linked_contest:contests!calcutta_prizes_linked_contest_id_fkey(name, contest_type)")
      .eq("contest_id", contestId)
      .order("sort_order");

    const prizes = (rawPrizes || []).map((p) => {
      const lc = Array.isArray(p.linked_contest) ? p.linked_contest[0] : p.linked_contest;
      return {
        id: p.id,
        prize_name: lc?.name || p.prize_name || "Unknown",
        place: p.place,
        percentage: p.percentage,
        sort_order: p.sort_order,
        per_player: p.per_player ?? false,
        player_count: p.player_count ?? 1,
      };
    });

    // For the active participant, fetch their scramble team partners and accolades
    const activeParticipant = (participants || []).find(
      (p) => p.auction_order === contest.calcutta_active_order
    );

    let teamPartners: { contest_name: string; partners: string[]; day_number: number | null; score: number | null; course_par: number | null; is_participant: boolean }[] = [];
    let accolades: { title: string; trip_name?: string }[] = [];
    let cornholeSinglesIn: boolean | null = null;
    let eightBagAverage: number | null = null;
    let avgScrambleScore: number | null = null;
    let handicapIndex: number | null = null;

    if (activeParticipant) {
      // Get all scramble + cornhole_doubles contests for this trip (always show all boxes)
      const { data: tripTeamContests } = await adminClient
        .from("contests")
        .select("id, name, day_number, contest_type")
        .eq("trip_id", contest.trip_id)
        .in("contest_type", ["scramble", "cornhole_doubles"])
        .order("day_number", { nullsFirst: false });

      // Build maps of contest_id -> partners, score, and course_par for this user
      const partnerMap = new Map<string, string[]>();
      const scoreMap = new Map<string, number | null>();
      const parMap = new Map<string, number | null>();

      // Get scramble teams this user is on
      const { data: memberRows } = await adminClient
        .from("scramble_team_members")
        .select("team_id, scramble_teams(id, contest_id, gross_score, course_par, scramble_team_members(user_id, user:users(display_name)))")
        .eq("user_id", activeParticipant.user_id);

      if (memberRows) {
        for (const row of memberRows) {
          const team = Array.isArray(row.scramble_teams) ? row.scramble_teams[0] : row.scramble_teams;
          if (!team) continue;

          const members = (team.scramble_team_members as Array<{
            user_id: string;
            user: { display_name: string } | { display_name: string }[] | null;
          }>)
            .filter((m) => m.user_id !== activeParticipant.user_id)
            .map((m) => {
              const u = Array.isArray(m.user) ? m.user[0] : m.user;
              return u?.display_name || "Unknown";
            });

          if (members.length > 0) {
            partnerMap.set(team.contest_id, members);
          }
          scoreMap.set(team.contest_id, team.gross_score ?? null);
          parMap.set(team.contest_id, team.course_par ?? null);
        }
      }

      // Get cornhole doubles teams this user is on
      const { data: cornholeRows } = await adminClient
        .from("cornhole_team_members")
        .select("team_id, cornhole_teams(id, contest_id, cornhole_team_members(user_id, user:users(display_name)))")
        .eq("user_id", activeParticipant.user_id);

      if (cornholeRows) {
        for (const row of cornholeRows) {
          const team = Array.isArray(row.cornhole_teams) ? row.cornhole_teams[0] : row.cornhole_teams;
          if (!team) continue;

          const members = (team.cornhole_team_members as Array<{
            user_id: string;
            user: { display_name: string } | { display_name: string }[] | null;
          }>)
            .filter((m) => m.user_id !== activeParticipant.user_id)
            .map((m) => {
              const u = Array.isArray(m.user) ? m.user[0] : m.user;
              return u?.display_name || "Unknown";
            });

          if (members.length > 0) {
            partnerMap.set(team.contest_id, members);
          }
        }
      }

      // Check which contests this user is a participant in
      const contestIdsToCheck = (tripTeamContests || []).map((tc) => tc.id);
      const { data: userParticipations } = await adminClient
        .from("contest_participants")
        .select("contest_id")
        .eq("user_id", activeParticipant.user_id)
        .in("contest_id", contestIdsToCheck);
      const participatingContestIds = new Set((userParticipations || []).map((p) => p.contest_id));

      // Build teamPartners for ALL contests
      for (const tc of tripTeamContests || []) {
        teamPartners.push({
          contest_name: tc.name,
          partners: partnerMap.get(tc.id) || [],
          day_number: tc.day_number,
          score: tc.contest_type === "scramble" ? (scoreMap.get(tc.id) ?? null) : null,
          course_par: tc.contest_type === "scramble" ? (parMap.get(tc.id) ?? null) : null,
          is_participant: participatingContestIds.has(tc.id),
        });
      }

      // Sort by day_number so Thursday comes before Friday, etc.
      teamPartners.sort((a, b) => (a.day_number ?? 99) - (b.day_number ?? 99));

      // Check cornhole singles participation
      const { data: cornholeSinglesContest } = await adminClient
        .from("contests")
        .select("id")
        .eq("trip_id", contest.trip_id)
        .eq("contest_type", "cornhole_singles")
        .single();

      if (cornholeSinglesContest) {
        const { data: singlesEntry } = await adminClient
          .from("contest_participants")
          .select("id")
          .eq("contest_id", cornholeSinglesContest.id)
          .eq("user_id", activeParticipant.user_id)
          .maybeSingle();

        cornholeSinglesIn = !!singlesEntry;
      }

      // Get accolades across all trips
      const { data: accData } = await adminClient
        .from("accolades")
        .select("title, trip:trip_settings(event_name)")
        .eq("user_id", activeParticipant.user_id);

      if (accData) {
        accolades = accData.map((a) => {
          const trip = Array.isArray(a.trip) ? a.trip[0] : a.trip;
          return {
            title: a.title,
            trip_name: (trip as { event_name?: string })?.event_name || undefined,
          };
        });
      }

      // Fetch handicap and user metrics
      const [{ data: handicapRow }, { data: userMetrics }] = await Promise.all([
        adminClient
          .from("player_handicaps")
          .select("handicap_index")
          .eq("user_id", activeParticipant.user_id)
          .maybeSingle(),
        adminClient
          .from("users")
          .select("eight_bag_average, avg_scramble_score")
          .eq("id", activeParticipant.user_id)
          .single(),
      ]);

      handicapIndex = handicapRow?.handicap_index ?? null;
      if (userMetrics) {
        eightBagAverage = userMetrics.eight_bag_average;
        avgScrambleScore = userMetrics.avg_scramble_score;
      }
    }

    // Fetch ownership records
    const participantIds = (participants || []).map((p) => p.id);
    const { data: ownershipRows } = participantIds.length > 0
      ? await adminClient
          .from("calcutta_ownership")
          .select("id, participant_id, owner_id, share_pct, amount_paid, is_buyback, owner:users!calcutta_ownership_owner_id_fkey(id, display_name, avatar_url)")
          .in("participant_id", participantIds)
      : { data: [] };

    const ownershipMap = new Map<string, typeof ownershipRows>();
    for (const row of ownershipRows || []) {
      const list = ownershipMap.get(row.participant_id) || [];
      list.push(row);
      ownershipMap.set(row.participant_id, list);
    }

    // Normalize
    const normalizedParticipants = (participants || []).map((p) => {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      const o = Array.isArray(p.owner) ? p.owner[0] : p.owner;
      const ownerships = (ownershipMap.get(p.id) || []).map((ow) => {
        const owUser = Array.isArray(ow.owner) ? ow.owner[0] : ow.owner;
        return {
          id: ow.id,
          owner_id: ow.owner_id,
          share_pct: ow.share_pct,
          amount_paid: ow.amount_paid,
          is_buyback: ow.is_buyback,
          owner: owUser ? { id: owUser.id, display_name: owUser.display_name, avatar_url: owUser.avatar_url } : null,
        };
      });
      return {
        id: p.id,
        user_id: p.user_id,
        auction_order: p.auction_order,
        bid_amount: p.bid_amount,
        sold_at: p.sold_at,
        owner_id: p.owner_id,
        user: u ? {
          id: u.id,
          display_name: u.display_name,
          full_name: u.full_name,
          avatar_url: u.avatar_url,
          birthday: u.birthday,
        } : null,
        owner: o ? {
          id: o.id,
          display_name: o.display_name,
          avatar_url: o.avatar_url,
        } : null,
        ownerships,
      };
    });

    // Fetch resolved winners for prizes
    const prizeIds = (prizes || []).map((p) => p.id);
    const { data: winnerRows } = prizeIds.length > 0
      ? await adminClient
          .from("contest_winners")
          .select("prize_id, user_id, is_playoff, notes, user:users!contest_winners_user_id_fkey(id, display_name, avatar_url)")
          .in("prize_id", prizeIds)
      : { data: [] };

    // Group winners by prize_id
    const winnersByPrize: Record<string, Array<{ user_id: string; display_name: string; avatar_url: string | null; is_playoff: boolean; notes: string | null }>> = {};
    for (const w of winnerRows || []) {
      const wu = Array.isArray(w.user) ? w.user[0] : w.user;
      if (!winnersByPrize[w.prize_id]) winnersByPrize[w.prize_id] = [];
      winnersByPrize[w.prize_id].push({
        user_id: w.user_id,
        display_name: wu?.display_name || "Unknown",
        avatar_url: wu?.avatar_url || null,
        is_playoff: w.is_playoff,
        notes: w.notes,
      });
    }

    // Calculate pool for payout display
    const pool = normalizedParticipants.reduce((sum, p) => sum + (Number(p.bid_amount) || 0), 0);

    // Enrich prizes with winners
    const enrichedPrizes = prizes.map((p) => ({
      ...p,
      winners: winnersByPrize[p.id] || [],
      total_payout: pool * p.percentage / 100,
    }));

    // Check if the current user is a buyer who hasn't paid
    const { data: buyerPaidRow } = await adminClient
      .from("calcutta_buyer_paid")
      .select("id")
      .eq("contest_id", contestId)
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    // Calculate total amount this user owes as a buyer
    let buyerOwes = 0;
    if (!buyerPaidRow) {
      for (const p of normalizedParticipants) {
        if (p.ownerships && p.ownerships.length > 0) {
          for (const o of p.ownerships) {
            if (o.owner_id === effectiveUserId) {
              buyerOwes += Number(o.amount_paid) || 0;
            }
          }
        } else if (p.owner_id === effectiveUserId) {
          buyerOwes += Number(p.bid_amount) || 0;
        }
      }
    }

    // Bulk fetch handicaps + user metrics for all participants (for Loozers table)
    const allUserIds = (participants || []).map((p) => p.user_id).filter(Boolean);
    const [{ data: allHandicaps }, { data: allUserMetrics }] = await Promise.all([
      allUserIds.length > 0
        ? adminClient.from("player_handicaps").select("user_id, handicap_index").in("user_id", allUserIds)
        : { data: [] },
      allUserIds.length > 0
        ? adminClient.from("users").select("id, eight_bag_average, avg_scramble_score").in("id", allUserIds)
        : { data: [] },
    ]);

    const loozerStats: Record<string, { handicap: number | null; eightBag: number | null; avgScramble: number | null }> = {};
    for (const uid of allUserIds) {
      const h = (allHandicaps || []).find((r) => r.user_id === uid);
      const s = (allUserMetrics || []).find((r) => r.id === uid);
      loozerStats[uid] = {
        handicap: h?.handicap_index ?? null,
        eightBag: s?.eight_bag_average ?? null,
        avgScramble: s?.avg_scramble_score ?? null,
      };
    }

    return NextResponse.json({
      contest_name: contest.name,
      active_order: contest.calcutta_active_order,
      participants: normalizedParticipants,
      prizes: enrichedPrizes,
      pool,
      spotlight: activeParticipant ? { teamPartners, accolades, cornholeSinglesIn, eightBagAverage, avgScrambleScore, handicapIndex } : null,
      loozerStats,
      buyer_paid: !!buyerPaidRow,
      buyer_owes: buyerOwes,
    });
  } catch (error) {
    console.error("Get calcutta display error:", error);
    return NextResponse.json({ error: "Failed to load display data" }, { status: 500 });
  }
}
