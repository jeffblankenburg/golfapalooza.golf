import { createClient } from "@/lib/supabase/server";
import { ScoresLeaderboard } from "@/components/ScoresLeaderboard";
import { getEffectiveUserId } from "@/lib/simulator";

export default async function ScoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const effectiveUserId = await getEffectiveUserId(user!.id);

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, trip_name, trip_year, start_date, show_teams")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Scores</h1>
        <p className="text-gray-500 text-center py-8">
          No active event found.
        </p>
      </div>
    );
  }

  if (!trip.show_teams) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Scores</h1>
        <p className="text-gray-500 text-center py-8">
          Teams and scores are coming soon!
        </p>
      </div>
    );
  }

  // Fetch scramble contests
  const { data: contests } = await supabase
    .from("contests")
    .select("id, name, day_number, contest_type")
    .eq("trip_id", trip.id)
    .in("contest_type", ["scramble", "kgb_cup"])
    .order("day_number");

  // Fetch all scramble teams
  const scrambleContestIds = (contests || [])
    .filter((c) => c.contest_type === "scramble")
    .map((c) => c.id);

  const { data: teams } = scrambleContestIds.length > 0
    ? await supabase
        .from("scramble_teams")
        .select(
          "id, contest_id, team_handicap, gross_score, course_par, scramble_team_members(user_id, user:users(display_name, avatar_url))"
        )
        .in("contest_id", scrambleContestIds)
    : { data: [] };

  // Normalize teams by contest
  const teamsByContest: Record<
    string,
    {
      id: string;
      team_handicap: number;
      gross_score: number | null;
      course_par: number;
      members: { display_name: string; avatar_url: string | null }[];
    }[]
  > = {};

  for (const team of teams || []) {
    if (!teamsByContest[team.contest_id]) {
      teamsByContest[team.contest_id] = [];
    }
    const members = ((team as Record<string, unknown>).scramble_team_members as Array<{
      user_id: string;
      user: { display_name: string; avatar_url: string | null } | Array<{ display_name: string; avatar_url: string | null }> | null;
    }>).map((m) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
      };
    });

    teamsByContest[team.contest_id].push({
      id: team.id,
      team_handicap: team.team_handicap,
      gross_score: team.gross_score,
      course_par: team.course_par,
      members,
    });
  }

  // Fetch all tee times for this trip with players
  const { data: teeTimesRaw } = await supabase
    .from("tee_times")
    .select(
      "id, day_number, tee_time, starting_hole, scramble_team_id, tee_time_players(user_id, user:users(display_name, avatar_url))"
    )
    .eq("trip_id", trip.id)
    .order("tee_time", { ascending: true, nullsFirst: false });

  // Build a map from scramble_team_id to members (for scramble-linked tee times)
  const scrambleTeamMembers: Record<string, { display_name: string; avatar_url: string | null }[]> = {};
  for (const contestTeams of Object.values(teamsByContest)) {
    for (const team of contestTeams) {
      scrambleTeamMembers[team.id] = team.members;
    }
  }

  // Normalize tee times by day
  const teeTimesByDay: Record<
    number,
    {
      id: string;
      tee_time: string | null;
      starting_hole: number | null;
      members: { display_name: string; avatar_url: string | null }[];
    }[]
  > = {};

  for (const tt of teeTimesRaw || []) {
    if (!teeTimesByDay[tt.day_number]) {
      teeTimesByDay[tt.day_number] = [];
    }

    let members: { display_name: string; avatar_url: string | null }[];

    if (tt.scramble_team_id && scrambleTeamMembers[tt.scramble_team_id]) {
      members = scrambleTeamMembers[tt.scramble_team_id];
    } else {
      members = ((tt as Record<string, unknown>).tee_time_players as Array<{
        user_id: string;
        user: { display_name: string; avatar_url: string | null } | Array<{ display_name: string; avatar_url: string | null }> | null;
      }>).map((p) => {
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

  // Build days array: all golf days (1-4) from contests
  const days = (contests || []).map((contest) => ({
    contest_id: contest.id,
    name: contest.name,
    day_number: contest.day_number,
    contest_type: contest.contest_type,
    teams: teamsByContest[contest.id] || [],
    teeTimeGroups: teeTimesByDay[contest.day_number ?? 0] || [],
  }));

  return (
    <ScoresLeaderboard
      days={days}
      startDate={trip.start_date}
      currentUserId={effectiveUserId}
    />
  );
}
