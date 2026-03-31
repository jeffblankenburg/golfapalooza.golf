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
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  // Fetch teams with members
  const { data: teams, error: teamsError } = await supabase
    .from("scramble_teams")
    .select(`
      id,
      team_handicap,
      gross_score,
      course_par,
      verified_at,
      members:scramble_team_members(
        user_id,
        user:users(display_name, avatar_url)
      )
    `)
    .eq("contest_id", contestId)
    .order("team_handicap", { ascending: false });

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  // Fetch hole scores for all teams
  const teamIds = (teams || []).map((t) => t.id);
  const { data: holeScores, error: scoresError } = await supabase
    .from("scramble_hole_scores")
    .select("team_id, hole_number, strokes")
    .in("team_id", teamIds.length > 0 ? teamIds : ["none"]);

  if (scoresError) {
    return NextResponse.json({ error: scoresError.message }, { status: 500 });
  }

  // Fetch hole info from contest tee assignments
  const { data: teeAssignments, error: teeError } = await supabase
    .from("contest_hole_tees")
    .select(`
      hole_number,
      tee:course_tees(
        tee_name,
        tee_color,
        holes:course_holes(hole_number, par, handicap_index, yards)
      )
    `)
    .eq("contest_id", contestId)
    .order("hole_number");

  if (teeError) {
    return NextResponse.json({ error: teeError.message }, { status: 500 });
  }

  // Build hole info from tee assignments
  const holes: { hole_number: number; par: number; handicap_index: number }[] = [];
  for (const ta of teeAssignments || []) {
    const tee = Array.isArray(ta.tee) ? ta.tee[0] : ta.tee;
    if (!tee) continue;
    const teeHoles = tee.holes || [];
    const holeData = teeHoles.find(
      (h: { hole_number: number }) => h.hole_number === ta.hole_number
    );
    if (holeData) {
      holes.push({
        hole_number: ta.hole_number,
        par: holeData.par,
        handicap_index: holeData.handicap_index,
      });
    }
  }

  // Normalize teams
  const normalizedTeams = (teams || []).map((t) => ({
    id: t.id,
    team_handicap: t.team_handicap,
    gross_score: t.gross_score,
    course_par: t.course_par,
    verified_at: t.verified_at || null,
    members: (t.members || []).map((m: { user_id: string; user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] }) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        user_id: m.user_id,
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
      };
    }),
  }));

  return NextResponse.json({
    teams: normalizedTeams,
    holeScores: holeScores || [],
    holes: holes.sort((a, b) => a.hole_number - b.hole_number),
  });
}
