import { createClient } from "@/lib/supabase/server";
import { ScoresLeaderboard } from "@/components/ScoresLeaderboard";

export default async function ScoresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, trip_name, trip_year, start_date")
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

  // Fetch scramble contests
  const { data: contests } = await supabase
    .from("contests")
    .select("id, name, day_number")
    .eq("trip_id", trip.id)
    .eq("contest_type", "scramble")
    .order("day_number");

  if (!contests || contests.length === 0) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Scores</h1>
        <p className="text-gray-500 text-center py-8">
          Scramble scores will appear here once the competition begins.
        </p>
      </div>
    );
  }

  // Fetch all teams for all scramble contests
  const contestIds = contests.map((c) => c.id);
  const { data: teams } = await supabase
    .from("scramble_teams")
    .select(
      "id, contest_id, team_handicap, gross_score, course_par, scramble_team_members(user_id, user:users(display_name, avatar_url))"
    )
    .in("contest_id", contestIds);

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

  const days = contests.map((contest) => ({
    contest_id: contest.id,
    name: contest.name,
    day_number: contest.day_number,
    teams: teamsByContest[contest.id] || [],
  }));

  return (
    <ScoresLeaderboard
      days={days}
      startDate={trip.start_date}
      currentUserId={user!.id}
    />
  );
}
