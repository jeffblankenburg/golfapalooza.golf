/**
 * Scramble winner resolution with handicap scorecard tiebreaker.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getStrokesOnHole, sortByDifficulty, HoleWithHandicap } from "@/lib/golf/stroke-distribution";

interface TeamResult {
  id: string;
  gross_score: number;
  team_handicap: number;
  net_score: number;
  member_user_ids: string[];
}

export interface ScrambleWinnerResult {
  userIds: string[];
  teamId: string;
  tiebreaker?: string; // human-readable tiebreaker explanation for the winner
  tiebreakerLoss?: string; // human-readable explanation for the loser(s)
}

/**
 * Resolve the winning team for a scramble contest at a given place.
 * Returns the winning team's member user_ids, or null if no teams exist.
 */
export async function resolveScrambleWinner(
  supabase: SupabaseClient,
  contestId: string,
  place: number
): Promise<ScrambleWinnerResult | null> {
  // Fetch all teams with scores
  const { data: teams, error: teamErr } = await supabase
    .from("scramble_teams")
    .select("id, gross_score, team_handicap")
    .eq("contest_id", contestId)
    .not("gross_score", "is", null);

  if (teamErr) throw new Error(teamErr.message);
  if (!teams || teams.length === 0) return null;

  // Fetch all team members
  const teamIds = teams.map((t) => t.id);
  const { data: members, error: memberErr } = await supabase
    .from("scramble_team_members")
    .select("team_id, user_id")
    .in("team_id", teamIds);

  if (memberErr) throw new Error(memberErr.message);

  // Build team results with net scores
  const teamResults: TeamResult[] = teams.map((t) => ({
    id: t.id,
    gross_score: t.gross_score,
    team_handicap: t.team_handicap,
    net_score: t.gross_score - t.team_handicap,
    member_user_ids: (members || [])
      .filter((m) => m.team_id === t.id)
      .map((m) => m.user_id),
  }));

  // Sort by net score ascending
  teamResults.sort((a, b) => a.net_score - b.net_score);

  // Find teams that already won higher places for this contest
  const { data: existingWinners } = await supabase
    .from("contest_winners")
    .select("prize_id, user_id, prize:calcutta_prizes!inner(linked_contest_id, place)")
    .not("prize", "is", null);

  const excludedTeamIds = new Set<string>();
  if (existingWinners) {
    for (const w of existingWinners) {
      const prize = Array.isArray(w.prize) ? w.prize[0] : w.prize;
      if (prize?.linked_contest_id === contestId && prize?.place < place) {
        const team = teamResults.find((t) => t.member_user_ids.includes(w.user_id));
        if (team) excludedTeamIds.add(team.id);
      }
    }
  }

  // Filter out excluded teams
  const eligible = teamResults.filter((t) => !excludedTeamIds.has(t.id));
  if (eligible.length === 0) return null;

  const bestNet = eligible[0].net_score;
  const tied = eligible.filter((t) => t.net_score === bestNet);

  if (tied.length === 1) {
    return { userIds: tied[0].member_user_ids, teamId: tied[0].id };
  }

  // Tiebreaker: handicap scorecard playoff
  const result = await breakScrambleTie(supabase, contestId, tied);
  if (result) {
    return result;
  }

  // Extremely rare: all 18 holes tied. Return first team (fallback).
  return { userIds: tied[0].member_user_ids, teamId: tied[0].id, tiebreaker: "Tied on all 18 holes" };
}

/**
 * Break a scramble tie by comparing NET scores hole-by-hole
 * in handicap index order (#1 hardest first).
 * Returns the winning team with a tiebreaker explanation.
 */
async function breakScrambleTie(
  supabase: SupabaseClient,
  contestId: string,
  tiedTeams: TeamResult[]
): Promise<ScrambleWinnerResult | null> {
  // Get the trip's course holes via contest_hole_tees
  const { data: teeAssignments } = await supabase
    .from("contest_hole_tees")
    .select("hole_number, tee_id")
    .eq("contest_id", contestId);

  if (!teeAssignments || teeAssignments.length === 0) return null;

  // Get the course_id from the trip
  const { data: contest } = await supabase
    .from("contests")
    .select("trip:trip_settings!inner(course_id)")
    .eq("id", contestId)
    .single();

  const courseId = (contest?.trip as unknown as { course_id: string } | null)?.course_id;
  if (!courseId) return null;

  // Fetch hole data with handicap_index
  const teeIds = [...new Set(teeAssignments.map((ta) => ta.tee_id))];
  const { data: courseHoles } = await supabase
    .from("course_holes")
    .select("tee_id, hole_number, handicap_index, par")
    .eq("course_id", courseId)
    .in("tee_id", teeIds);

  if (!courseHoles || courseHoles.length === 0) return null;

  // Build hole info with handicap_index and par
  const holeMap = new Map<string, { handicap_index: number; par: number }>();
  for (const h of courseHoles) {
    holeMap.set(`${h.tee_id}-${h.hole_number}`, { handicap_index: h.handicap_index, par: h.par });
  }

  const holesWithPar: Record<number, number> = {};
  const holes: HoleWithHandicap[] = teeAssignments.map((ta) => {
    const info = holeMap.get(`${ta.tee_id}-${ta.hole_number}`);
    holesWithPar[ta.hole_number] = info?.par || 4;
    return {
      hole_number: ta.hole_number,
      handicap_index: info?.handicap_index || 0,
    };
  });

  const sortedHoles = sortByDifficulty(holes);

  // Fetch hole scores for tied teams
  const tiedTeamIds = tiedTeams.map((t) => t.id);
  const { data: holeScores } = await supabase
    .from("scramble_hole_scores")
    .select("team_id, hole_number, strokes")
    .in("team_id", tiedTeamIds);

  if (!holeScores) return null;

  // Build score lookup: team_id -> hole_number -> strokes
  const scoreLookup: Record<string, Record<number, number>> = {};
  for (const s of holeScores) {
    if (!scoreLookup[s.team_id]) scoreLookup[s.team_id] = {};
    scoreLookup[s.team_id][s.hole_number] = s.strokes;
  }

  // Fetch team member names for the tiebreaker explanation
  const { data: memberNames } = await supabase
    .from("scramble_team_members")
    .select("team_id, user:users(display_name)")
    .in("team_id", tiedTeamIds);

  const teamNameMap: Record<string, string> = {};
  for (const tid of tiedTeamIds) {
    const names = (memberNames || [])
      .filter((m) => m.team_id === tid)
      .map((m) => {
        const u = Array.isArray(m.user) ? m.user[0] : m.user;
        return (u as { display_name: string })?.display_name || "?";
      });
    teamNameMap[tid] = names.join(", ");
  }

  // Compare hole by hole in handicap order
  for (const hole of sortedHoles) {
    const netScores: { team: TeamResult; net: number; gross: number }[] = [];

    for (const team of tiedTeams) {
      const gross = scoreLookup[team.id]?.[hole.hole_number];
      if (gross === undefined) continue;
      const strokes = getStrokesOnHole(team.team_handicap, hole.hole_number, sortedHoles);
      netScores.push({ team, net: gross - strokes, gross });
    }

    if (netScores.length < tiedTeams.length) continue;

    const minNet = Math.min(...netScores.map((s) => s.net));
    const winners = netScores.filter((s) => s.net === minNet);

    if (winners.length === 1) {
      const winner = winners[0];
      const losers = netScores.filter((s) => s.team.id !== winner.team.id);
      const holePar = holesWithPar[hole.hole_number] || 4;

      const formatNet = (net: number) => {
        if (net === holePar) return "net par";
        if (net === holePar - 1) return "net birdie";
        if (net < holePar) return `net ${holePar - net} under`;
        if (net === holePar + 1) return "net bogey";
        return `net ${net - holePar} over`;
      };

      return {
        userIds: winner.team.member_user_ids,
        teamId: winner.team.id,
        tiebreaker: `Won tiebreaker on Hole ${hole.hole_number} with ${formatNet(winner.net)} (${winner.net}) vs ${losers.map((l) => l.net).join(", ")}`,
        tiebreakerLoss: `Lost tiebreaker on Hole ${hole.hole_number} with ${formatNet(losers[0].net)} (${losers[0].net}) vs ${winner.net}`,
      };
    }

    // Still tied on this hole, continue to next
    tiedTeams = winners.map((w) => w.team);
  }

  // All 18 holes tied
  return null;
}
