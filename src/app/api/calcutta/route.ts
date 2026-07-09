import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - Public display data for the Calcutta auction.
// Spectators (no auth) get the same view minus buyer-specific fields.
const RANDY_USER_ID = "539feb9d-eb8d-4dfe-88d3-7d0bc89c7154";

// Supabase returns to-one joins as an object, but the typings widen to
// `T | T[]`. Normalize defensively so downstream code stays simple.
function unwrap<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

interface PartnerRef {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

// One entry per (loozer, award category), collapsing repeat wins into a count.
interface GroupedAccolade {
  category: string;
  title: string;
  short_label: string;
  icon: string;
  icon_url: string | null;
  sort_order: number;
  count: number;
  trip_name: string | null;
  trip_year: number | null;
  partners: PartnerRef[];
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveUserId = user ? await getEffectiveUserId(user.id) : null;

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

    const teamPartners: { contest_name: string; partners: string[]; partnerAvatars: (string | null)[]; day_number: number | null; score: number | null; course_par: number | null; is_participant: boolean }[] = [];
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
      const partnerAvatarMap = new Map<string, (string | null)[]>();
      const scoreMap = new Map<string, number | null>();
      const parMap = new Map<string, number | null>();

      // Get scramble teams this user is on
      const { data: memberRows } = await adminClient
        .from("scramble_team_members")
        .select("team_id, scramble_teams(id, contest_id, gross_score, course_par, scramble_team_members(user_id, user:users(display_name, avatar_url)))")
        .eq("user_id", activeParticipant.user_id);

      if (memberRows) {
        for (const row of memberRows) {
          const team = Array.isArray(row.scramble_teams) ? row.scramble_teams[0] : row.scramble_teams;
          if (!team) continue;

          const teammates = (team.scramble_team_members as Array<{
            user_id: string;
            user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;
          }>)
            .filter((m) => m.user_id !== activeParticipant.user_id)
            .map((m) => {
              const u = Array.isArray(m.user) ? m.user[0] : m.user;
              return { name: u?.display_name || "Unknown", avatar_url: u?.avatar_url ?? null };
            });

          if (teammates.length > 0) {
            partnerMap.set(team.contest_id, teammates.map((t) => t.name));
            partnerAvatarMap.set(team.contest_id, teammates.map((t) => t.avatar_url));
          }
          scoreMap.set(team.contest_id, team.gross_score ?? null);
          parMap.set(team.contest_id, team.course_par ?? null);
        }
      }

      // Get cornhole doubles teams this user is on
      const { data: cornholeRows } = await adminClient
        .from("cornhole_team_members")
        .select("team_id, cornhole_teams(id, contest_id, cornhole_team_members(user_id, user:users(display_name, avatar_url)))")
        .eq("user_id", activeParticipant.user_id);

      if (cornholeRows) {
        for (const row of cornholeRows) {
          const team = Array.isArray(row.cornhole_teams) ? row.cornhole_teams[0] : row.cornhole_teams;
          if (!team) continue;

          const teammates = (team.cornhole_team_members as Array<{
            user_id: string;
            user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;
          }>)
            .filter((m) => m.user_id !== activeParticipant.user_id)
            .map((m) => {
              const u = Array.isArray(m.user) ? m.user[0] : m.user;
              return { name: u?.display_name || "Unknown", avatar_url: u?.avatar_url ?? null };
            });

          if (teammates.length > 0) {
            partnerMap.set(team.contest_id, teammates.map((t) => t.name));
            partnerAvatarMap.set(team.contest_id, teammates.map((t) => t.avatar_url));
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
          partnerAvatars: partnerAvatarMap.get(tc.id) || [],
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
    // (spectators have no buyer identity — skip these lookups)
    const { data: buyerPaidRow } = effectiveUserId
      ? await adminClient
          .from("calcutta_buyer_paid")
          .select("id")
          .eq("contest_id", contestId)
          .eq("user_id", effectiveUserId)
          .maybeSingle()
      : { data: null };

    // Calculate total amount this user owes as a buyer
    let buyerOwes = 0;
    if (effectiveUserId && !buyerPaidRow) {
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
    const [{ data: allHandicaps }, { data: allUserMetrics }, { data: randyUser }, { data: accRows }] = await Promise.all([
      allUserIds.length > 0
        ? adminClient.from("player_handicaps").select("user_id, handicap_index").in("user_id", allUserIds)
        : { data: [] },
      allUserIds.length > 0
        ? adminClient.from("users").select("id, eight_bag_average, avg_scramble_score").in("id", allUserIds)
        : { data: [] },
      adminClient.from("users").select("avatar_url").eq("id", RANDY_USER_ID).maybeSingle(),
      // Every accolade where a participant is either the winner OR the doubles
      // partner. One row per doubles team, so we attribute it to both members.
      allUserIds.length > 0
        ? adminClient
            .from("accolades")
            .select("id, title, category, user_id, partner_user_id, trip:trip_settings(trip_name, trip_year), winner:users!accolades_user_id_fkey(id, display_name, avatar_url), partner:users!accolades_partner_user_id_fkey(id, display_name, avatar_url), category_meta:accolade_categories!accolades_category_fkey(category, title, short_label, icon, icon_url, sort_order)")
            .or(`user_id.in.(${allUserIds.join(",")}),partner_user_id.in.(${allUserIds.join(",")})`)
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

    // Group each participant's accolades by category, collapsing repeat wins
    // into a count and gathering doubles partners. Custom accolades group by
    // their free-form title so unrelated honors don't merge.
    const participantIdSet = new Set(allUserIds);
    const accByUser = new Map<string, Map<string, GroupedAccolade>>();

    const addAccolade = (
      loozerId: string,
      row: {
        title: string;
        category: string;
        trip: unknown;
        category_meta: unknown;
      },
      partner: PartnerRef | null
    ) => {
      let groups = accByUser.get(loozerId);
      if (!groups) {
        groups = new Map();
        accByUser.set(loozerId, groups);
      }
      const meta = unwrap(row.category_meta) as
        | { title: string; short_label: string; icon: string; icon_url: string | null; sort_order: number }
        | null;
      const isCustom = row.category === "custom" || !meta;
      const displayTitle = isCustom ? row.title : meta!.title;
      const key = isCustom ? `custom:${row.title}` : row.category;
      const trip = unwrap(row.trip) as { trip_name?: string; trip_year?: number } | null;

      let g = groups.get(key);
      if (!g) {
        g = {
          category: row.category,
          title: displayTitle,
          short_label: meta?.short_label || displayTitle,
          icon: meta?.icon || "🏆",
          icon_url: meta?.icon_url ?? null,
          sort_order: meta?.sort_order ?? 99,
          count: 0,
          trip_name: null,
          trip_year: null,
          partners: [],
        };
        groups.set(key, g);
      }
      g.count += 1;
      const ty = trip?.trip_year ?? null;
      if (ty != null && (g.trip_year == null || ty > g.trip_year)) {
        g.trip_year = ty;
        g.trip_name = trip?.trip_name ?? null;
      } else if (g.trip_name == null && trip?.trip_name) {
        g.trip_name = trip.trip_name;
      }
      if (partner && !g.partners.some((p) => p.id === partner.id)) {
        g.partners.push(partner);
      }
    };

    for (const row of accRows || []) {
      const winner = unwrap(row.winner) as PartnerRef | null;
      const partner = unwrap(row.partner) as PartnerRef | null;
      if (participantIdSet.has(row.user_id)) {
        addAccolade(row.user_id, row, partner);
      }
      if (row.partner_user_id && participantIdSet.has(row.partner_user_id)) {
        addAccolade(row.partner_user_id, row, winner);
      }
    }

    const loozerAccolades: Record<string, GroupedAccolade[]> = {};
    for (const [uid, groups] of accByUser) {
      loozerAccolades[uid] = [...groups.values()].sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          b.count - a.count ||
          (b.trip_year ?? 0) - (a.trip_year ?? 0)
      );
    }

    return NextResponse.json({
      contest_name: contest.name,
      active_order: contest.calcutta_active_order,
      participants: normalizedParticipants,
      prizes: enrichedPrizes,
      pool,
      spotlight: activeParticipant ? { teamPartners, accolades: loozerAccolades[activeParticipant.user_id] || [], cornholeSinglesIn, eightBagAverage, avgScrambleScore, handicapIndex } : null,
      loozerStats,
      loozerAccolades,
      buyer_paid: effectiveUserId ? !!buyerPaidRow : true,
      buyer_owes: buyerOwes,
      randy_avatar_url: randyUser?.avatar_url || null,
    });
  } catch (error) {
    console.error("Get calcutta display error:", error);
    return NextResponse.json({ error: "Failed to load display data" }, { status: 500 });
  }
}
