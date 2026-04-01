import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  // 1. Fetch all scramble contests for this trip
  const { data: contests, error: contestErr } = await supabase
    .from("contests")
    .select("id, day_number")
    .eq("trip_id", tripId)
    .eq("contest_type", "scramble");

  if (contestErr) {
    return NextResponse.json({ error: contestErr.message }, { status: 500 });
  }

  if (!contests || contests.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const contestIds = contests.map((c) => c.id);
  const contestDayMap: Record<string, number> = {};
  for (const c of contests) {
    contestDayMap[c.id] = c.day_number;
  }

  // 2. Fetch all scramble teams for those contests
  const { data: teams, error: teamErr } = await supabase
    .from("scramble_teams")
    .select("id, contest_id, gross_score, course_par, team_handicap")
    .in("contest_id", contestIds);

  if (teamErr) {
    return NextResponse.json({ error: teamErr.message }, { status: 500 });
  }

  if (!teams || teams.length === 0) {
    return NextResponse.json({ leaderboard: [] });
  }

  const teamIds = teams.map((t) => t.id);

  // 3. Fetch all team members with user info
  const { data: members, error: memberErr } = await supabase
    .from("scramble_team_members")
    .select("team_id, user_id, user:users(display_name, avatar_url)")
    .in("team_id", teamIds);

  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  // 4. Fetch all bspitw bonus points
  const { data: bonuses, error: bonusErr } = await supabase
    .from("bspitw_bonus_points")
    .select("team_id, hole_number, user_id, on_green, holed_out")
    .in("team_id", teamIds);

  if (bonusErr) {
    return NextResponse.json({ error: bonusErr.message }, { status: 500 });
  }

  // 5. Fetch calcutta ownership (owner_id -> display_name)
  const { data: calcuttaContest } = await supabase
    .from("contests")
    .select("id")
    .eq("trip_id", tripId)
    .eq("contest_type", "calcutta")
    .single();

  const ownerMap: Record<string, string> = {}; // user_id -> owner display_name
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

  // 6. Calculate per-player points
  interface PlayerPoints {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    owner_name: string | null;
    under_par_points: number;
    on_green_points: number;
    holed_out_points: number;
    total_points: number;
    days: Record<number, { under_par: number; on_green: number; holed_out: number; total: number }>;
  }

  const playerMap: Record<string, PlayerPoints> = {};

  // Build team -> day_number lookup
  const teamDayMap: Record<string, number> = {};
  for (const t of teams) {
    teamDayMap[t.id] = contestDayMap[t.contest_id];
  }

  // Initialize players from team members
  for (const m of members || []) {
    const u = Array.isArray(m.user) ? m.user[0] : m.user;
    if (!playerMap[m.user_id]) {
      playerMap[m.user_id] = {
        user_id: m.user_id,
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
        owner_name: ownerMap[m.user_id] || null,
        under_par_points: 0,
        on_green_points: 0,
        holed_out_points: 0,
        total_points: 0,
        days: {},
      };
    }
  }

  // Calculate under-par points per team, shared by all members
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

  // Calculate on_green and holed_out points
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

  // Calculate totals
  for (const p of Object.values(playerMap)) {
    p.total_points = p.under_par_points + p.on_green_points + p.holed_out_points;
    for (const day of Object.values(p.days)) {
      day.total = day.under_par + day.on_green + day.holed_out;
    }
  }

  // Only players who are a participant in ALL scramble contests qualify for BSPITW
  const { data: allContestParticipants } = await supabase
    .from("contest_participants")
    .select("contest_id, user_id")
    .in("contest_id", contestIds);

  const playerContestCount: Record<string, number> = {};
  for (const cp of allContestParticipants || []) {
    playerContestCount[cp.user_id] = (playerContestCount[cp.user_id] || 0) + 1;
  }

  const totalScrambleContests = contestIds.length;

  const leaderboard = Object.values(playerMap)
    .filter((p) => (playerContestCount[p.user_id] || 0) === totalScrambleContests)
    .sort((a, b) => b.total_points - a.total_points || a.display_name.localeCompare(b.display_name));

  return NextResponse.json({ leaderboard });
}
