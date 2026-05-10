import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getEffectiveUserId, getEffectiveDate, getEffectiveTripId } from "@/lib/simulator";
import { ContestList } from "@/components/ContestList";
import { deriveFoursomes } from "@/lib/kgb-cup/derive-foursomes";
import { isFeatureVisible } from "@/lib/visibility";

export default async function ContestsPage() {
  const user = await getAuthUser();
  const supabase = await createClient();

  const effectiveUserId = await getEffectiveUserId(user!.id);

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, trip_name, start_date, show_teams, visibility_overrides")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Contests</h1>
        <p className="text-gray-500 text-center py-8">
          No active event found.
        </p>
      </div>
    );
  }

  const effectiveDate = await getEffectiveDate();
  const visCtx = { start_date: trip.start_date, visibility_overrides: (trip.visibility_overrides as Record<string, boolean>) || {} };
  const showTeams = isFeatureVisible("teams", visCtx, effectiveDate);

  // Fetch all contests for the trip
  const { data: contests } = await supabase
    .from("contests")
    .select("id, name, contest_type, day_number, sort_order, verified_at")
    .eq("trip_id", trip.id)
    .order("sort_order")
    .order("day_number");

  const contestIds = (contests || []).map((c) => c.id);

  // Fetch participants with user details
  const { data: participants } = contestIds.length
    ? await supabase
        .from("contest_participants")
        .select("contest_id, user_id, user:users(display_name, avatar_url)")
        .in("contest_id", contestIds)
    : { data: [] };

  // Build participant count map, user set, and participant details
  const countMap: Record<string, number> = {};
  const userContests = new Set<string>();
  const participantsByContest: Record<
    string,
    { display_name: string; avatar_url: string | null }[]
  > = {};

  for (const p of participants || []) {
    countMap[p.contest_id] = (countMap[p.contest_id] || 0) + 1;
    if (p.user_id === effectiveUserId) {
      userContests.add(p.contest_id);
    }
    if (!participantsByContest[p.contest_id]) {
      participantsByContest[p.contest_id] = [];
    }
    const u = Array.isArray(p.user) ? p.user[0] : p.user;
    participantsByContest[p.contest_id].push({
      display_name: (u as { display_name: string } | null)?.display_name || "Unknown",
      avatar_url: (u as { avatar_url: string | null } | null)?.avatar_url || null,
    });
  }

  // Fetch detail data when show_teams is true
  const scrambleContestIds = (contests || [])
    .filter((c) => c.contest_type === "scramble")
    .map((c) => c.id);

  const ryderContestIds = (contests || [])
    .filter((c) => c.contest_type === "ryder_cup" || c.contest_type === "kgb_cup")
    .map((c) => c.id);

  // Parallel fetches for detail data
  const [teamsResult, ryderTeamsResult, ryderPairsResult, teeTimesResult] =
    await Promise.all([
      // Scramble teams
      scrambleContestIds.length > 0 && showTeams
        ? supabase
            .from("scramble_teams")
            .select(
              "id, contest_id, team_handicap, gross_score, course_par, scramble_team_members(user_id, user:users(display_name, avatar_url))"
            )
            .in("contest_id", scrambleContestIds)
        : Promise.resolve({ data: [] }),

      // Ryder cup teams
      ryderContestIds.length > 0 && showTeams
        ? supabase
            .from("ryder_cup_teams")
            .select("id, contest_id, team_number, team_name, team_color")
            .in("contest_id", ryderContestIds)
        : Promise.resolve({ data: [] }),

      // Ryder cup pairs
      ryderContestIds.length > 0 && showTeams
        ? supabase
            .from("ryder_cup_pairs")
            .select(
              "id, contest_id, team_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(display_name), player_b:users!ryder_cup_pairs_player_b_id_fkey(display_name), player_c:users!ryder_cup_pairs_player_c_id_fkey(display_name)"
            )
            .in("contest_id", ryderContestIds)
        : Promise.resolve({ data: [] }),

      // Tee times
      showTeams
        ? supabase
            .from("tee_times")
            .select(
              "id, day_number, tee_time, starting_hole, scramble_team_id, tee_time_players(user_id, user:users(display_name, avatar_url))"
            )
            .eq("trip_id", trip.id)
            .order("tee_time", { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] }),
    ]);

  // Build scramble teams by contest
  const scrambleTeamsByContest: Record<
    string,
    {
      id: string;
      team_handicap: number;
      gross_score: number | null;
      course_par: number;
      members: { display_name: string; avatar_url: string | null }[];
    }[]
  > = {};

  // Also build a quick lookup for scramble team members (for tee time resolution)
  const scrambleTeamMembersMap: Record<
    string,
    { display_name: string; avatar_url: string | null }[]
  > = {};

  for (const team of teamsResult.data || []) {
    if (!scrambleTeamsByContest[team.contest_id]) {
      scrambleTeamsByContest[team.contest_id] = [];
    }
    const members = (
      (team as Record<string, unknown>).scramble_team_members as Array<{
        user_id: string;
        user:
          | { display_name: string; avatar_url: string | null }
          | Array<{ display_name: string; avatar_url: string | null }>
          | null;
      }>
    ).map((m) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
      };
    });

    scrambleTeamsByContest[team.contest_id].push({
      id: team.id,
      team_handicap: team.team_handicap,
      gross_score: team.gross_score,
      course_par: team.course_par,
      members,
    });

    scrambleTeamMembersMap[team.id] = members;
  }

  // Offset team handicaps per contest so the lowest team plays at 0
  for (const contestId of Object.keys(scrambleTeamsByContest)) {
    const teams = scrambleTeamsByContest[contestId];
    if (teams.length > 0) {
      const lowestHC = Math.min(...teams.map((t) => t.team_handicap));
      for (const t of teams) {
        t.team_handicap = Math.max(0, t.team_handicap - lowestHC);
      }
    }
  }

  // Fetch KGB Cup scoring summaries for ryder cup contests
  const kgbCupScoresByContest: Record<
    string,
    {
      team1Name: string;
      team2Name: string;
      team1Points: number;
      team2Points: number;
      completedSections: number;
      totalSections: number;
      team1Color?: string;
      team2Color?: string;
      verified?: boolean;
    }
  > = {};

  if (ryderContestIds.length > 0 && showTeams) {
    // Batch fetch ALL ryder cup data at once instead of per-contest loop
    const allRcTeamIds = ryderTeamsResult.data?.map((t) => t.id) || [];

    const [allRcPairsResult, allKgbScoresResult] = await Promise.all([
      allRcTeamIds.length > 0
        ? supabase
            .from("ryder_cup_pairs")
            .select("id, team_id, sort_order")
            .in("team_id", allRcTeamIds)
            .gt("sort_order", 0)
        : Promise.resolve({ data: [] as { id: string; team_id: string; sort_order: number }[] }),
      supabase
        .from("kgb_cup_hole_scores")
        .select("foursome_id, hole_number, scorer_type, scorer_id")
        .limit(5000),
    ]);

    if (allKgbScoresResult.data && allKgbScoresResult.data.length > 0) {
      // Group teams by contest
      const teamsByContest = new Map<string, typeof ryderTeamsResult.data>();
      for (const t of ryderTeamsResult.data || []) {
        const arr = teamsByContest.get(t.contest_id) || [];
        arr.push(t);
        teamsByContest.set(t.contest_id, arr);
      }

      for (const cId of ryderContestIds) {
        const rcTeams = teamsByContest.get(cId) || [];
        const rcTeamIds = rcTeams.map((t) => t.id);
        const rcPairs = (allRcPairsResult.data || []).filter((p) => rcTeamIds.includes(p.team_id));
        const rcFoursomes = deriveFoursomes(rcPairs, rcTeams);

        if (rcTeams.length === 2 && rcFoursomes.length > 0) {
          const foursomeIds = new Set(rcFoursomes.map((f) => f.id));
          const allScores = (allKgbScoresResult.data || []).filter((s) => foursomeIds.has(s.foursome_id));

          if (allScores.length > 0) {
            const totalSections = rcFoursomes.length * 5;
            let completedSections = 0;
            for (const fId of foursomeIds) {
              const fScores = allScores.filter((s) => s.foursome_id === fId);
              for (const section of [1, 2, 3] as const) {
                const startHole = (section - 1) * 6 + 1;
                const endHole = section * 6;
                if (section < 3) {
                  const sectionScores = fScores.filter(
                    (s) => s.scorer_type === "player" && s.hole_number >= startHole && s.hole_number <= endHole
                  );
                  const scorerIds = new Set(sectionScores.map((s) => s.scorer_id));
                  for (const sid of scorerIds) {
                    const holesScored = new Set(
                      sectionScores.filter((s) => s.scorer_id === sid).map((s) => s.hole_number)
                    );
                    if (holesScored.size === 6) completedSections++;
                  }
                } else {
                  const sectionScores = fScores.filter(
                    (s) => s.scorer_type === "pair" && s.hole_number >= startHole && s.hole_number <= endHole
                  );
                  const scorerIds = new Set(sectionScores.map((s) => s.scorer_id));
                  if (scorerIds.size >= 2) {
                    const allComplete = [...scorerIds].every((sid) => {
                      const holesScored = new Set(
                        sectionScores.filter((s) => s.scorer_id === sid).map((s) => s.hole_number)
                      );
                      return holesScored.size === 6;
                    });
                    if (allComplete) completedSections++;
                  }
                }
              }
            }

            const team1 = rcTeams.find((t) => t.team_number === 1);
            const team2 = rcTeams.find((t) => t.team_number === 2);

            kgbCupScoresByContest[cId] = {
              team1Name: team1?.team_name || "Team 1",
              team2Name: team2?.team_name || "Team 2",
              team1Points: 0,
              team2Points: 0,
              completedSections: Math.min(completedSections, totalSections),
              totalSections,
              team1Color: team1?.team_color || undefined,
              team2Color: team2?.team_color || undefined,
              verified: !!(contests || []).find((c) => c.id === cId)?.verified_at,
            };
          }
        }
      }
    }
  }

  // Build ryder cup data by contest
  const ryderDataByContest: Record<
    string,
    {
      teams: { id: string; team_number: number; team_name: string }[];
      pairs: {
        id: string;
        team_id: string;
        sort_order: number;
        player_a: string;
        player_b: string;
        player_c: string;
      }[];
    }
  > = {};

  for (const t of ryderTeamsResult.data || []) {
    if (!ryderDataByContest[t.contest_id]) {
      ryderDataByContest[t.contest_id] = { teams: [], pairs: [] };
    }
    ryderDataByContest[t.contest_id].teams.push({
      id: t.id,
      team_number: t.team_number,
      team_name: t.team_name,
    });
  }

  for (const p of ryderPairsResult.data || []) {
    if (!ryderDataByContest[p.contest_id]) {
      ryderDataByContest[p.contest_id] = { teams: [], pairs: [] };
    }
    const playerA = Array.isArray(p.player_a)
      ? p.player_a[0]?.display_name
      : (p.player_a as { display_name: string } | null)?.display_name;
    const playerB = Array.isArray(p.player_b)
      ? p.player_b[0]?.display_name
      : (p.player_b as { display_name: string } | null)?.display_name;
    const playerC = Array.isArray(p.player_c)
      ? p.player_c[0]?.display_name
      : (p.player_c as { display_name: string } | null)?.display_name;
    ryderDataByContest[p.contest_id].pairs.push({
      id: p.id,
      team_id: p.team_id,
      sort_order: p.sort_order,
      player_a: playerA || "",
      player_b: playerB || "",
      player_c: playerC || "",
    });
  }

  // Build tee times by day
  const teeTimesByDay: Record<
    number,
    {
      id: string;
      tee_time: string | null;
      starting_hole: number | null;
      members: { display_name: string; avatar_url: string | null }[];
    }[]
  > = {};

  for (const tt of teeTimesResult.data || []) {
    if (!teeTimesByDay[tt.day_number]) {
      teeTimesByDay[tt.day_number] = [];
    }

    let members: { display_name: string; avatar_url: string | null }[];

    if (tt.scramble_team_id && scrambleTeamMembersMap[tt.scramble_team_id]) {
      members = scrambleTeamMembersMap[tt.scramble_team_id];
    } else {
      members = (
        (tt as Record<string, unknown>).tee_time_players as Array<{
          user_id: string;
          user:
            | { display_name: string; avatar_url: string | null }
            | Array<{ display_name: string; avatar_url: string | null }>
            | null;
        }>
      ).map((p) => {
        const u = Array.isArray(p.user) ? p.user[0] : p.user;
        return {
          display_name: u?.display_name || "Unknown",
          avatar_url: u?.avatar_url || null,
        };
      });
    }

    teeTimesByDay[tt.day_number].push({
      id: tt.id,
      tee_time: tt.tee_time,
      starting_hole: tt.starting_hole,
      members,
    });
  }

  // Map contest_id → day_number for tee time lookup
  const contestDayMap: Record<string, number | null> = {};
  for (const c of contests || []) {
    contestDayMap[c.id] = c.day_number;
  }

  // Build contest detail data
  type ContestDetailData = {
    scrambleTeams?: typeof scrambleTeamsByContest[string];
    ryderData?: typeof ryderDataByContest[string];
    teeTimeGroups?: typeof teeTimesByDay[number];
    participants?: { display_name: string; avatar_url: string | null }[];
    kgbCupScores?: typeof kgbCupScoresByContest[string];
  };

  const detailData: Record<string, ContestDetailData> = {};

  for (const c of contests || []) {
    const detail: ContestDetailData = {};

    if (c.contest_type === "scramble") {
      detail.scrambleTeams = scrambleTeamsByContest[c.id] || [];
      const dayNum = c.day_number;
      if (dayNum !== null) {
        detail.teeTimeGroups = teeTimesByDay[dayNum] || [];
      }
    } else if (c.contest_type === "ryder_cup" || c.contest_type === "kgb_cup") {
      detail.ryderData = ryderDataByContest[c.id] || {
        teams: [],
        pairs: [],
        foursomes: [],
      };
      if (kgbCupScoresByContest[c.id]) {
        detail.kgbCupScores = kgbCupScoresByContest[c.id];
      }
    }

    detail.participants = participantsByContest[c.id] || [];
    detailData[c.id] = detail;
  }

  const contestsWithMeta = (contests || []).map((c) => ({
    id: c.id,
    name: c.name,
    contestType: c.contest_type,
    dayNumber: c.day_number,
    participantCount: countMap[c.id] || 0,
    isParticipating: userContests.has(c.id),
  }));

  return (
    <ContestList
      contests={contestsWithMeta}
      startDate={trip.start_date}
      showTeams={showTeams ?? false}
      detailData={detailData}
    />
  );
}
