import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, getEffectiveDate, isSimulating } from "@/lib/simulator";
import { KgbCupLiveScorer } from "@/components/scoring/KgbCupLiveScorer";

export default async function KgbCupScoringPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user.id);
  const queryClient = simulating ? createAdminClient() : supabase;
  const adminClient = createAdminClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date, course_id")
    .eq("status", "active")
    .single();

  if (!trip) redirect("/");

  // Compute today's day number
  const today = await getEffectiveDate();
  const startDate = new Date(trip.start_date + "T00:00:00");
  const diffDays = Math.floor(
    (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const todayDayNumber = diffDays + 1;

  // Find ryder_cup contest (no longer restricted to today's day)
  const { data: contest } = await queryClient
    .from("contests")
    .select("id, day_number, scoring_closed_at, verified_at")
    .eq("trip_id", trip.id)
    .eq("contest_type", "ryder_cup")
    .maybeSingle();

  if (!contest) redirect("/kgb-cup");

  // Find user's pair (via ryder_cup_pairs)
  const { data: teams } = await adminClient
    .from("ryder_cup_teams")
    .select("id, team_number, team_name, team_color")
    .eq("contest_id", contest.id)
    .order("team_number");

  const teamIds = (teams || []).map((t) => t.id);

  const { data: allPairs } = teamIds.length > 0
    ? await adminClient
        .from("ryder_cup_pairs")
        .select(
          "id, team_id, player_a_id, player_b_id, player_c_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name, avatar_url), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name, avatar_url), player_c:users!ryder_cup_pairs_player_c_id_fkey(id, display_name, avatar_url)"
        )
        .in("team_id", teamIds)
        .order("sort_order")
    : { data: [] };

  // Find user's pair
  const myPair = (allPairs || []).find(
    (p) => p.player_a_id === effectiveUserId || p.player_b_id === effectiveUserId || p.player_c_id === effectiveUserId
  );

  if (!myPair) redirect("/kgb-cup");

  // Derive user's foursome from pairs (match by sort_order across teams)
  const myTeam = (teams || []).find((t) => t.id === myPair.team_id);
  const otherTeam = (teams || []).find((t) => t.id !== myPair.team_id);

  if (!myTeam || !otherTeam) redirect("/kgb-cup");

  const matchingPair = (allPairs || []).find(
    (p) => p.team_id === otherTeam.id && p.sort_order === myPair.sort_order
  );

  if (!matchingPair) redirect("/kgb-cup");

  // Foursome ID = team1 pair's ID (pair from team_number=1)
  const team1 = (teams || []).find((t) => t.team_number === 1)!;
  const isMyTeamTeam1 = myTeam.id === team1.id;
  const myFoursome = {
    id: isMyTeamTeam1 ? myPair.id : matchingPair.id,
    pair_team1_id: isMyTeamTeam1 ? myPair.id : matchingPair.id,
    pair_team2_id: isMyTeamTeam1 ? matchingPair.id : myPair.id,
    sort_order: myPair.sort_order,
  };

  // Get the other pair
  const otherPairId =
    myFoursome.pair_team1_id === myPair.id
      ? myFoursome.pair_team2_id
      : myFoursome.pair_team1_id;

  const otherPair = (allPairs || []).find((p) => p.id === otherPairId);

  // Build player info with team colors
  const teamColorMap = new Map<string, string | null>();
  for (const t of teams || []) {
    teamColorMap.set(t.id, t.team_color);
  }

  interface PlayerInfo {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    teamColor: string | null;
  }

  const normPlayer = (
    raw: { id: string; display_name: string; avatar_url: string | null } | Array<{ id: string; display_name: string; avatar_url: string | null }> | null,
    teamId: string
  ): PlayerInfo | null => {
    const u = Array.isArray(raw) ? raw[0] : raw;
    if (!u) return null;
    return {
      id: u.id,
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      teamColor: teamColorMap.get(teamId) || null,
    };
  };

  // Build ordered players list: team1_a, team1_b, team2_a, team2_b
  // Based on foursome pair order
  const pair1 = myFoursome.pair_team1_id === myPair.id ? myPair : otherPair;
  const pair2 = myFoursome.pair_team1_id === myPair.id ? otherPair : myPair;

  const players: PlayerInfo[] = [];
  const p1a = normPlayer(pair1!.player_a as never, pair1!.team_id);
  const p1b = normPlayer(pair1!.player_b as never, pair1!.team_id);
  const p1c = normPlayer(pair1!.player_c as never, pair1!.team_id);
  const p2a = normPlayer(pair2!.player_a as never, pair2!.team_id);
  const p2b = normPlayer(pair2!.player_b as never, pair2!.team_id);
  const p2c = normPlayer(pair2!.player_c as never, pair2!.team_id);
  if (p1a) players.push(p1a);
  if (p1b) players.push(p1b);
  if (p1c) players.push(p1c);
  if (p2a) players.push(p2a);
  if (p2b) players.push(p2b);
  if (p2c) players.push(p2c);

  // Pairs for scramble section
  const pairInfos = [
    { id: pair1!.id, teamId: pair1!.team_id, players: [p1a, p1b, p1c].filter(Boolean) as PlayerInfo[] },
    { id: pair2!.id, teamId: pair2!.team_id, players: [p2a, p2b, p2c].filter(Boolean) as PlayerInfo[] },
  ];

  // Fetch tee time for starting hole
  const { data: teeTime } = await adminClient
    .from("tee_time_players")
    .select("tee_time:tee_times(tee_time, starting_hole)")
    .eq("user_id", effectiveUserId)
    .limit(10);

  // Find tee time that matches today's day
  let startingHole = 1;
  if (teeTime) {
    for (const ttp of teeTime) {
      const tt = Array.isArray(ttp.tee_time) ? ttp.tee_time[0] : ttp.tee_time;
      if (tt?.starting_hole) {
        startingHole = tt.starting_hole as number;
        break;
      }
    }
  }

  // Fetch course holes (with images)
  let holes: {
    hole_number: number;
    hole_name: string | null;
    par: number;
    handicap_index: number;
    yards: number;
    tee_color: string | null;
    overhead_image_url: string | null;
    green_image_url: string | null;
    tee_latitude: number | null;
    tee_longitude: number | null;
    green_latitude: number | null;
    green_longitude: number | null;
    drive_latitude: number | null;
    drive_longitude: number | null;
    green_front_latitude: number | null;
    green_front_longitude: number | null;
    green_back_latitude: number | null;
    green_back_longitude: number | null;
  }[] = [];

  if (trip.course_id) {
    const [teeAssignmentsResult, courseHolesResult, courseTeesResult] = await Promise.all([
      adminClient
        .from("contest_hole_tees")
        .select("hole_number, tee_id")
        .eq("contest_id", contest.id)
        .order("hole_number"),
      adminClient
        .from("course_holes")
        .select("tee_id, hole_number, hole_name, par, yards, handicap_index, overhead_image_url, green_image_url, tee_latitude, tee_longitude, green_latitude, green_longitude, drive_latitude, drive_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude")
        .eq("course_id", trip.course_id),
      adminClient
        .from("course_tees")
        .select("id, tee_color")
        .eq("course_id", trip.course_id),
    ]);

    const teeAssignments = teeAssignmentsResult.data;
    const courseHoles = courseHolesResult.data;
    const courseTees = courseTeesResult.data;

    if (teeAssignments && teeAssignments.length > 0 && courseHoles) {
      const teeColorMap = new Map<string, string | null>();
      for (const t of courseTees || []) teeColorMap.set(t.id, t.tee_color);

      const holeMap = new Map<string, {
        par: number; yards: number; handicap_index: number;
        hole_name: string | null;
        overhead_image_url: string | null; green_image_url: string | null;
        tee_latitude: number | null; tee_longitude: number | null;
        green_latitude: number | null; green_longitude: number | null;
        drive_latitude: number | null; drive_longitude: number | null;
        green_front_latitude: number | null; green_front_longitude: number | null;
        green_back_latitude: number | null; green_back_longitude: number | null;
      }>();
      for (const h of courseHoles) {
        holeMap.set(`${h.tee_id}-${h.hole_number}`, {
          par: h.par,
          yards: h.yards || 0,
          handicap_index: h.handicap_index || 0,
          hole_name: h.hole_name ?? null,
          overhead_image_url: h.overhead_image_url || null,
          green_image_url: h.green_image_url || null,
          tee_latitude: h.tee_latitude ?? null,
          tee_longitude: h.tee_longitude ?? null,
          green_latitude: h.green_latitude ?? null,
          green_longitude: h.green_longitude ?? null,
          drive_latitude: h.drive_latitude ?? null,
          drive_longitude: h.drive_longitude ?? null,
          green_front_latitude: h.green_front_latitude ?? null,
          green_front_longitude: h.green_front_longitude ?? null,
          green_back_latitude: h.green_back_latitude ?? null,
          green_back_longitude: h.green_back_longitude ?? null,
        });
      }

      holes = teeAssignments.map((ta) => {
        const data = holeMap.get(`${ta.tee_id}-${ta.hole_number}`);
        return {
          hole_number: ta.hole_number,
          hole_name: data?.hole_name ?? null,
          par: data?.par || 4,
          yards: data?.yards || 0,
          handicap_index: data?.handicap_index || 0,
          tee_color: teeColorMap.get(ta.tee_id) ?? null,
          overhead_image_url: data?.overhead_image_url ?? null,
          green_image_url: data?.green_image_url ?? null,
          tee_latitude: data?.tee_latitude ?? null,
          tee_longitude: data?.tee_longitude ?? null,
          green_latitude: data?.green_latitude ?? null,
          green_longitude: data?.green_longitude ?? null,
          drive_latitude: data?.drive_latitude ?? null,
          drive_longitude: data?.drive_longitude ?? null,
          green_front_latitude: data?.green_front_latitude ?? null,
          green_front_longitude: data?.green_front_longitude ?? null,
          green_back_latitude: data?.green_back_latitude ?? null,
          green_back_longitude: data?.green_back_longitude ?? null,
        };
      });
    }
  }

  // Fetch existing scores
  const { data: existingScores } = await adminClient
    .from("kgb_cup_hole_scores")
    .select("foursome_id, hole_number, scorer_type, scorer_id, strokes")
    .eq("foursome_id", myFoursome.id);

  // Fetch handicaps: base handicaps from player_handicaps, pair handicaps from kgb_cup_pair_handicaps
  const allPlayerIds = players.map((p) => p.id);
  const [baseHandicapsResult, pairHandicapsResult] = await Promise.all([
    allPlayerIds.length > 0
      ? adminClient
          .from("player_handicaps")
          .select("user_id, handicap_index")
          .in("user_id", allPlayerIds)
      : Promise.resolve({ data: [] }),
    adminClient
      .from("kgb_cup_pair_handicaps")
      .select("pair_id, scramble_handicap")
      .eq("contest_id", contest.id),
  ]);

  // Compute per-foursome adjusted handicaps (subtract lowest in the foursome)
  const baseMap = new Map<string, number>();
  for (const bh of baseHandicapsResult.data || []) {
    baseMap.set(bh.user_id, bh.handicap_index ?? 0);
  }
  const handicaps = allPlayerIds.map((id) => baseMap.get(id) ?? 0);
  const lowest = handicaps.length > 0 ? Math.min(...handicaps) : 0;
  const adjustedPlayerHandicaps = allPlayerIds.map((id) => ({
    playerId: id,
    adjustedHandicap: Math.round((baseMap.get(id) ?? 0) - lowest),
  }));

  const sortedHoles = holes.sort((a, b) => a.hole_number - b.hole_number);

  return (
    <KgbCupLiveScorer
      foursomeId={myFoursome.id}
      contestId={contest.id}
      pairs={pairInfos}
      startingHole={startingHole}
      holes={sortedHoles}
      initialScores={existingScores || []}
      playerHandicaps={adjustedPlayerHandicaps}
      pairHandicaps={(() => {
        const allPairs = (pairHandicapsResult.data || []).map((h) => ({
          pairId: h.pair_id,
          scrambleHandicap: h.scramble_handicap as number,
        }));
        // Only offset the two pairs in this foursome against each other
        const foursomePairIds = new Set([myFoursome.pair_team1_id, myFoursome.pair_team2_id]);
        const foursomePairs = allPairs.filter((p) => foursomePairIds.has(p.pairId));
        const lowestPair = foursomePairs.length > 0 ? Math.min(...foursomePairs.map((p) => p.scrambleHandicap)) : 0;
        return allPairs.map((p) => ({
          pairId: p.pairId,
          scrambleHandicap: foursomePairIds.has(p.pairId)
            ? Math.round(p.scrambleHandicap - lowestPair)
            : p.scrambleHandicap,
        }));
      })()}
      scoringClosed={!!contest.scoring_closed_at}
      contestVerified={!!contest.verified_at}
    />
  );
}
