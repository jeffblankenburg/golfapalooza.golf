/**
 * BSPITW (Best Scramble Partner In The World) scoring computation.
 * Extracted from /api/bspitw for reuse in winner resolution.
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface BspitwPlayerPoints {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  owner_name: string | null;
  handicap_index: number | null;
  under_par_points: number;
  on_green_points: number;
  holed_out_points: number;
  total_points: number;
  days: Record<number, { under_par: number; on_green: number; holed_out: number; total: number }>;
}

/**
 * Compute the full BSPITW leaderboard for a trip.
 * Only players who participated in ALL scramble contests qualify.
 */
export async function computeBspitwLeaderboard(
  supabase: SupabaseClient,
  tripId: string
): Promise<BspitwPlayerPoints[]> {
  // 1. Fetch all scramble contests for this trip
  const { data: contests, error: contestErr } = await supabase
    .from("contests")
    .select("id, day_number")
    .eq("trip_id", tripId)
    .eq("contest_type", "scramble");

  if (contestErr) throw new Error(contestErr.message);
  if (!contests || contests.length === 0) return [];

  const contestIds = contests.map((c) => c.id);
  const contestDayMap: Record<string, number> = {};
  for (const c of contests) {
    contestDayMap[c.id] = c.day_number;
  }

  // 2. Fetch all scramble teams
  const { data: teams, error: teamErr } = await supabase
    .from("scramble_teams")
    .select("id, contest_id, gross_score, course_par, team_handicap")
    .in("contest_id", contestIds);

  if (teamErr) throw new Error(teamErr.message);
  if (!teams || teams.length === 0) return [];

  const teamIds = teams.map((t) => t.id);

  // 3. Fetch team members with user info
  const { data: members, error: memberErr } = await supabase
    .from("scramble_team_members")
    .select("team_id, user_id, user:users(display_name, avatar_url)")
    .in("team_id", teamIds);

  if (memberErr) throw new Error(memberErr.message);

  // 4. Fetch bonus points
  const { data: bonuses, error: bonusErr } = await supabase
    .from("bspitw_bonus_points")
    .select("team_id, hole_number, user_id, on_green, holed_out")
    .in("team_id", teamIds);

  if (bonusErr) throw new Error(bonusErr.message);

  // 5. Fetch calcutta ownership
  const { data: calcuttaContest } = await supabase
    .from("contests")
    .select("id")
    .eq("trip_id", tripId)
    .eq("contest_type", "calcutta")
    .single();

  const ownerMap: Record<string, string> = {};
  if (calcuttaContest) {
    const { data: participants } = await supabase
      .from("contest_participants")
      .select("user_id, owner:users!contest_participants_owner_id_fkey(display_name)")
      .eq("contest_id", calcuttaContest.id)
      .not("owner_id", "is", null);

    for (const p of participants || []) {
      const owner = Array.isArray(p.owner) ? p.owner[0] : p.owner;
      if (owner?.display_name) {
        ownerMap[p.user_id] = owner.display_name;
      }
    }
  }

  // 6. Fetch player handicaps
  const allUserIds = [...new Set((members || []).map((m) => m.user_id))];
  const handicapMap: Record<string, number | null> = {};
  if (allUserIds.length > 0) {
    const { data: handicaps } = await supabase
      .from("player_handicaps")
      .select("user_id, handicap_index")
      .in("user_id", allUserIds);
    for (const h of handicaps || []) {
      handicapMap[h.user_id] = h.handicap_index;
    }
  }

  // 7. Calculate per-player points
  const playerMap: Record<string, BspitwPlayerPoints> = {};

  const teamDayMap: Record<string, number> = {};
  for (const t of teams) {
    teamDayMap[t.id] = contestDayMap[t.contest_id];
  }

  for (const m of members || []) {
    const u = Array.isArray(m.user) ? m.user[0] : m.user;
    if (!playerMap[m.user_id]) {
      playerMap[m.user_id] = {
        user_id: m.user_id,
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
        owner_name: ownerMap[m.user_id] || null,
        handicap_index: handicapMap[m.user_id] ?? null,
        under_par_points: 0,
        on_green_points: 0,
        holed_out_points: 0,
        total_points: 0,
        days: {},
      };
    }
  }

  for (const m of members || []) {
    const p = playerMap[m.user_id];
    if (!p) continue;
    const dayNum = teamDayMap[m.team_id];
    if (dayNum && !p.days[dayNum]) {
      p.days[dayNum] = { under_par: 0, on_green: 0, holed_out: 0, total: 0 };
    }
  }

  // Under-par points
  for (const t of teams) {
    if (t.gross_score === null) continue;
    const netScore = t.gross_score - t.team_handicap;
    const underPar = Math.max(0, t.course_par - netScore);
    if (underPar === 0) continue;

    const dayNum = teamDayMap[t.id];
    const teamMembers = (members || []).filter((m) => m.team_id === t.id);

    for (const m of teamMembers) {
      const p = playerMap[m.user_id];
      if (!p) continue;
      if (!p.days[dayNum]) {
        p.days[dayNum] = { under_par: 0, on_green: 0, holed_out: 0, total: 0 };
      }
      p.days[dayNum].under_par += underPar;
      p.under_par_points += underPar;
    }
  }

  // Bonus points
  for (const b of bonuses || []) {
    const p = playerMap[b.user_id];
    if (!p) continue;
    const dayNum = teamDayMap[b.team_id];
    if (!p.days[dayNum]) {
      p.days[dayNum] = { under_par: 0, on_green: 0, holed_out: 0, total: 0 };
    }
    if (b.on_green) {
      p.days[dayNum].on_green += 1;
      p.on_green_points += 1;
    }
    if (b.holed_out) {
      p.days[dayNum].holed_out += 1;
      p.holed_out_points += 1;
    }
  }

  // Totals
  for (const p of Object.values(playerMap)) {
    p.total_points = p.under_par_points + p.on_green_points + p.holed_out_points;
    for (const day of Object.values(p.days)) {
      day.total = day.under_par + day.on_green + day.holed_out;
    }
  }

  // Only players in ALL scramble contests qualify
  const { data: allContestParticipants } = await supabase
    .from("contest_participants")
    .select("contest_id, user_id")
    .in("contest_id", contestIds);

  const playerContestCount: Record<string, number> = {};
  for (const cp of allContestParticipants || []) {
    playerContestCount[cp.user_id] = (playerContestCount[cp.user_id] || 0) + 1;
  }

  const totalScrambleContests = contestIds.length;

  return Object.values(playerMap)
    .filter((p) => (playerContestCount[p.user_id] || 0) === totalScrambleContests)
    .sort((a, b) => b.total_points - a.total_points || a.display_name.localeCompare(b.display_name));
}
