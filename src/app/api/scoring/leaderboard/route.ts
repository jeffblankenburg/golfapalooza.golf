import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/scoring/leaderboard:
 *   get:
 *     summary: Get live leaderboard for a contest
 *     tags: [Rounds]
 *     parameters:
 *       - in: query
 *         name: contest_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The contest ID
 *     responses:
 *       200:
 *         description: Leaderboard data
 *       401:
 *         description: Unauthorized
 */
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
    return NextResponse.json(
      { error: "contest_id is required" },
      { status: 400 }
    );
  }

  try {
    const adminClient = createAdminClient();

    // Get contest trip_id and day_number
    const { data: contest } = await adminClient
      .from("contests")
      .select("trip_id, day_number")
      .eq("id", contestId)
      .single();

    if (!contest) {
      return NextResponse.json(
        { error: "Contest not found" },
        { status: 404 }
      );
    }

    // Get trip course_id and start_date
    const { data: trip } = await adminClient
      .from("trip_settings")
      .select("course_id, start_date")
      .eq("id", contest.trip_id)
      .single();

    // Compute day name from start_date + day_number
    let dayName: string | null = null;
    if (trip?.start_date && contest.day_number) {
      const [year, month, day] = trip.start_date.split("-").map(Number);
      const date = new Date(year, month - 1, day + contest.day_number - 1);
      dayName = date.toLocaleDateString("en-US", { weekday: "long" });
    }

    // Get tee assignments for this contest
    const { data: teeAssignments } = await adminClient
      .from("contest_hole_tees")
      .select("hole_number, tee_id")
      .eq("contest_id", contestId)
      .order("hole_number");

    // Build hole par map from tee assignments + course_holes
    const parMap = new Map<number, number>();

    if (trip?.course_id && teeAssignments && teeAssignments.length > 0) {
      const teeIds = [...new Set(teeAssignments.map((ta) => ta.tee_id))];

      const { data: courseHoles } = await adminClient
        .from("course_holes")
        .select("tee_id, hole_number, par")
        .eq("course_id", trip.course_id)
        .in("tee_id", teeIds);

      if (courseHoles) {
        const holeDataMap = new Map<string, number>();
        for (const h of courseHoles) {
          holeDataMap.set(`${h.tee_id}-${h.hole_number}`, h.par);
        }
        for (const ta of teeAssignments) {
          const par = holeDataMap.get(`${ta.tee_id}-${ta.hole_number}`);
          parMap.set(ta.hole_number, par ?? 4);
        }
      }
    }

    // Fetch teams with members
    const { data: teams } = await adminClient
      .from("scramble_teams")
      .select(
        "id, team_handicap, scramble_team_members(user_id, user:users(display_name))"
      )
      .eq("contest_id", contestId);

    if (!teams || teams.length === 0) {
      return NextResponse.json({ leaderboard: [] });
    }

    // Fetch all hole scores for these teams
    const teamIds = teams.map((t) => t.id);
    const { data: scores } = await adminClient
      .from("scramble_hole_scores")
      .select("team_id, hole_number, strokes")
      .in("team_id", teamIds);

    // Build leaderboard
    const scoresByTeam = new Map<
      string,
      { hole_number: number; strokes: number }[]
    >();
    for (const s of scores || []) {
      const arr = scoresByTeam.get(s.team_id) || [];
      arr.push({ hole_number: s.hole_number, strokes: s.strokes });
      scoresByTeam.set(s.team_id, arr);
    }

    const leaderboard = teams.map((team) => {
      const members = (
        (team as Record<string, unknown>).scramble_team_members as Array<{
          user_id: string;
          user:
            | { display_name: string }
            | Array<{ display_name: string }>
            | null;
        }>
      ).map((m) => {
        const u = Array.isArray(m.user) ? m.user[0] : m.user;
        return u?.display_name || "Unknown";
      });

      const teamScores = scoresByTeam.get(team.id) || [];
      const holesCompleted = teamScores.length;
      const grossSoFar = teamScores.reduce((sum, s) => sum + s.strokes, 0);
      const parThrough = teamScores.reduce(
        (sum, s) => sum + (parMap.get(s.hole_number) ?? 4),
        0
      );
      const relPar = grossSoFar - parThrough;

      return {
        team_id: team.id,
        members,
        team_handicap: team.team_handicap,
        holes_completed: holesCompleted,
        gross_so_far: grossSoFar,
        par_through: parThrough,
        rel_par: relPar,
      };
    });

    // Sort by rel_par ascending (best first), ties broken by most holes completed
    leaderboard.sort((a, b) => {
      if (a.rel_par !== b.rel_par) return a.rel_par - b.rel_par;
      return b.holes_completed - a.holes_completed;
    });

    return NextResponse.json({ leaderboard, day_name: dayName });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
