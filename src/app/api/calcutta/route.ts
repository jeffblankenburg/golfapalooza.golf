import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET - Public display data for the Calcutta auction
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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

    let teamPartners: { contest_name: string; partners: string[]; day_number: number | null; score: number | null; course_par: number | null }[] = [];
    let accolades: { title: string; trip_name?: string }[] = [];
    let cornholeSinglesIn: boolean | null = null;

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

      // Build teamPartners for ALL contests (empty partners = not yet assigned)
      for (const tc of tripTeamContests || []) {
        teamPartners.push({
          contest_name: tc.name,
          partners: partnerMap.get(tc.id) || [],
          day_number: tc.day_number,
          score: tc.contest_type === "scramble" ? (scoreMap.get(tc.id) ?? null) : null,
          course_par: tc.contest_type === "scramble" ? (parMap.get(tc.id) ?? null) : null,
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
    }

    // Normalize
    const normalizedParticipants = (participants || []).map((p) => {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      const o = Array.isArray(p.owner) ? p.owner[0] : p.owner;
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
      };
    });

    return NextResponse.json({
      contest_name: contest.name,
      active_order: contest.calcutta_active_order,
      participants: normalizedParticipants,
      prizes: prizes || [],
      spotlight: activeParticipant ? { teamPartners, accolades, cornholeSinglesIn } : null,
    });
  } catch (error) {
    console.error("Get calcutta display error:", error);
    return NextResponse.json({ error: "Failed to load display data" }, { status: 500 });
  }
}
