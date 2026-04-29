import { createAdminClient } from "@/lib/supabase/admin";
import { KgbCupPageClient } from "@/app/(app)/kgb-cup/KgbCupPageClient";

export default async function SpectatorKgbCupPage() {
  const adminClient = createAdminClient();

  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id, trip_name, start_date, timezone")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">KGB Cup</h1>
        <p className="text-gray-500 text-center py-8">No active event found.</p>
      </div>
    );
  }

  const { data: contest } = await adminClient
    .from("contests")
    .select("id, name, day_number, scoring_closed_at, verified_at, tee_sheet_published_at")
    .eq("trip_id", trip.id)
    .eq("contest_type", "ryder_cup")
    .single();

  if (!contest) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">KGB Cup</h1>
        <p className="text-gray-500 text-center py-8">No KGB Cup contest found.</p>
      </div>
    );
  }

  const kgbDayNumber = contest.day_number || 1;

  const [teeTimesResult, teamsResult] = await Promise.all([
    adminClient
      .from("tee_times")
      .select("id, tee_time, starting_hole, tee_time_players(user_id, user:users(id, display_name, avatar_url))")
      .eq("trip_id", trip.id)
      .eq("day_number", kgbDayNumber)
      .order("tee_time", { ascending: true, nullsFirst: false }),
    adminClient
      .from("ryder_cup_teams")
      .select("id, team_number, team_name, team_color")
      .eq("contest_id", contest.id)
      .order("team_number"),
  ]);

  const teamIds = (teamsResult.data || []).map((t) => t.id);
  const pairsResult = teamIds.length > 0
    ? await adminClient
        .from("ryder_cup_pairs")
        .select("id, team_id, player_a_id, player_b_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name, avatar_url), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name, avatar_url)")
        .in("team_id", teamIds)
        .order("sort_order")
    : { data: [] };

  const pairIds = (pairsResult.data || []).map((p) => p.id);
  let hasAnyScores = false;
  if (pairIds.length > 0) {
    const { count } = await adminClient
      .from("kgb_cup_hole_scores")
      .select("foursome_id", { count: "exact", head: true })
      .in("foursome_id", pairIds);
    hasAnyScores = (count ?? 0) > 0;
  }

  interface TeeSheetGroup {
    id: string;
    teeTime: string | null;
    startingHole: number | null;
    players: { id: string; displayName: string; avatarUrl: string | null; teamColor: string | null }[];
  }

  const teamById = new Map<string, { team_number: number; team_name: string; team_color: string | null }>();
  for (const t of teamsResult.data || []) {
    teamById.set(t.id, { team_number: t.team_number, team_name: t.team_name, team_color: t.team_color });
  }

  const playerTeamColor = new Map<string, string | null>();
  for (const p of pairsResult.data || []) {
    const team = teamById.get(p.team_id);
    const color = team?.team_color || null;
    if (p.player_a_id) playerTeamColor.set(p.player_a_id, color);
    if (p.player_b_id) playerTeamColor.set(p.player_b_id, color);
  }

  const teeSheetGroups: TeeSheetGroup[] = (teeTimesResult.data || []).map((tt) => {
    const players = ((tt as Record<string, unknown>).tee_time_players as Array<{
      user_id: string;
      user: { id: string; display_name: string; avatar_url: string | null } | Array<{ id: string; display_name: string; avatar_url: string | null }> | null;
    }>).map((p) => {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      return {
        id: p.user_id,
        displayName: u?.display_name || "Unknown",
        avatarUrl: u?.avatar_url || null,
        teamColor: playerTeamColor.get(p.user_id) || null,
      };
    });

    return {
      id: tt.id,
      teeTime: tt.tee_time,
      startingHole: tt.starting_hole,
      players,
    };
  });

  teeSheetGroups.sort((a, b) => {
    const timeA = a.teeTime || "";
    const timeB = b.teeTime || "";
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return (a.startingHole || 0) - (b.startingHole || 0);
  });

  const firstTeeTime = teeSheetGroups.find((g) => g.teeTime)?.teeTime || null;
  const hasTeams = (teamsResult.data || []).length > 0;

  return (
    <KgbCupPageClient
      contestId={contest.id}
      startDate={trip.start_date}
      kgbDayNumber={kgbDayNumber}
      firstTeeTime={firstTeeTime}
      teeSheetGroups={teeSheetGroups}
      hasTeams={hasTeams}
      hasAnyScores={hasAnyScores}
      scoringLive={!contest.scoring_closed_at}
      contestComplete={!!contest.verified_at}
      teeSheetPublished={!!contest.tee_sheet_published_at}
      simulatedDate={null}
      timezone={trip.timezone}
    />
  );
}
