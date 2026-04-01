import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getSimDate } from "@/lib/simulator";
import { KgbCupPageClient } from "./KgbCupPageClient";

export default async function KgbCupPage() {
  const user = await getAuthUser();
  const supabase = await createClient();
  const simDate = await getSimDate();

  // Find active trip
  const { data: trip } = await supabase
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

  // Find ryder_cup contest
  const { data: contest } = await supabase
    .from("contests")
    .select("id, name, day_number")
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

  // Fetch tee sheet data for KGB Cup day
  const kgbDayNumber = contest.day_number || 1;

  const [teeTimesResult, foursomesResult, teamsResult] = await Promise.all([
    // Day 1 tee times with players (always fetch — display is state-driven)
    supabase
      .from("tee_times")
      .select("id, tee_time, starting_hole, kgb_foursome_id, tee_time_players(user_id, user:users(id, display_name, avatar_url))")
      .eq("trip_id", trip.id)
      .eq("day_number", kgbDayNumber)
      .order("tee_time", { ascending: true, nullsFirst: false }),
    // Foursomes
    supabase
      .from("ryder_cup_foursomes")
      .select("id, pair_team1_id, pair_team2_id, sort_order")
      .eq("contest_id", contest.id)
      .order("sort_order"),
    // Teams with colors
    supabase
      .from("ryder_cup_teams")
      .select("id, team_number, team_name, team_color")
      .eq("contest_id", contest.id)
      .order("team_number"),
  ]);

  // Fetch pairs via team IDs (ryder_cup_pairs has team_id, not contest_id)
  const teamIds = (teamsResult.data || []).map((t) => t.id);
  const pairsResult = teamIds.length > 0
    ? await supabase
        .from("ryder_cup_pairs")
        .select("id, team_id, player_a_id, player_b_id, sort_order, player_a:users!ryder_cup_pairs_player_a_id_fkey(id, display_name, avatar_url), player_b:users!ryder_cup_pairs_player_b_id_fkey(id, display_name, avatar_url)")
        .in("team_id", teamIds)
        .order("sort_order")
    : { data: [] };

  // Build tee time groups
  interface TeeSheetGroup {
    id: string;
    teeTime: string | null;
    startingHole: number | null;
    players: { id: string; displayName: string; avatarUrl: string | null; teamColor: string | null }[];
  }

  // Build pair-to-team lookup and player-to-team-color lookup
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

  // Build foursomeId → live players map from pairs data
  const foursomePlayers = new Map<string, { id: string; displayName: string; avatarUrl: string | null; teamColor: string | null }[]>();
  const pairsData = pairsResult.data || [];
  const pairById = new Map<string, { team_id: string; players: { id: string; display_name: string; avatar_url: string | null }[] }>();
  for (const p of pairsData) {
    const playerA = Array.isArray(p.player_a) ? p.player_a[0] : p.player_a;
    const playerB = Array.isArray(p.player_b) ? p.player_b[0] : p.player_b;
    const players: { id: string; display_name: string; avatar_url: string | null }[] = [];
    if (playerA) players.push(playerA);
    if (playerB) players.push(playerB);
    pairById.set(p.id, { team_id: p.team_id, players });
  }

  for (const f of foursomesResult.data || []) {
    const pair1 = pairById.get(f.pair_team1_id);
    const pair2 = pairById.get(f.pair_team2_id);
    const members: { id: string; displayName: string; avatarUrl: string | null; teamColor: string | null }[] = [];
    for (const pair of [pair1, pair2]) {
      if (!pair) continue;
      const color = teamById.get(pair.team_id)?.team_color || null;
      for (const pl of pair.players) {
        members.push({ id: pl.id, displayName: pl.display_name, avatarUrl: pl.avatar_url, teamColor: color });
      }
    }
    foursomePlayers.set(f.id, members);
  }

  const teeSheetGroups: TeeSheetGroup[] = (teeTimesResult.data || []).map((tt) => {
    const kgbFoursomeId = (tt as Record<string, unknown>).kgb_foursome_id as string | null;

    // If linked to a foursome, use live pair data instead of stale tee_time_players
    if (kgbFoursomeId && foursomePlayers.has(kgbFoursomeId)) {
      return {
        id: tt.id,
        teeTime: tt.tee_time,
        startingHole: tt.starting_hole,
        players: foursomePlayers.get(kgbFoursomeId)!,
      };
    }

    // Fallback: use tee_time_players (for non-KGB tee times or ones without a linked foursome)
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

  // Sort by tee time, then starting hole
  teeSheetGroups.sort((a, b) => {
    const timeA = a.teeTime || "";
    const timeB = b.teeTime || "";
    if (timeA !== timeB) return timeA.localeCompare(timeB);
    return (a.startingHole || 0) - (b.startingHole || 0);
  });

  // Find first tee time
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
      simulatedDate={simDate}
      timezone={trip.timezone}
    />
  );
}
