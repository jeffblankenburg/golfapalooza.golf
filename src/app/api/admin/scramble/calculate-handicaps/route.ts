import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { calculateCourseHandicap } from "@/lib/golf/calculator";

// Scramble handicap weights by team size (sorted best player first).
// Each set sums to ~50% of combined Course Handicaps.
const SCRAMBLE_WEIGHTS: Record<number, number[]> = {
  2: [0.35, 0.15],
  3: [0.25, 0.15, 0.10],
  4: [0.20, 0.15, 0.10, 0.05],
  5: [0.18, 0.14, 0.10, 0.05, 0.03],
};

/**
 * POST - Calculate team handicaps for all scramble teams in a contest.
 *
 * For each team, converts player Handicap Indexes to Course Handicaps,
 * sorts lowest to highest, and applies the weighted formula.
 */
export async function POST(request: Request) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { contest_id } = await request.json();
  if (!contest_id) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get contest and trip
  const { data: contest } = await admin
    .from("contests")
    .select("trip_id")
    .eq("id", contest_id)
    .single();

  if (!contest) {
    return NextResponse.json({ error: "Contest not found" }, { status: 404 });
  }

  // Get tee ratings — try contest_tees, then contest_hole_tees, then trip default
  let courseRating: number | null = null;
  let slopeRating: number | null = null;
  let par: number | null = null;

  const { data: contestTee } = await admin
    .from("contest_tees")
    .select("tee:course_tees!inner(course_rating, slope_rating, par)")
    .eq("contest_id", contest_id)
    .maybeSingle();

  if (contestTee) {
    const t = Array.isArray(contestTee.tee) ? contestTee.tee[0] : contestTee.tee;
    courseRating = t.course_rating;
    slopeRating = t.slope_rating;
    par = t.par;
  }

  if (courseRating == null) {
    const { data: holeTee } = await admin
      .from("contest_hole_tees")
      .select("tee:course_tees!inner(course_rating, slope_rating, par)")
      .eq("contest_id", contest_id)
      .limit(1)
      .maybeSingle();

    if (holeTee) {
      const t = Array.isArray(holeTee.tee) ? holeTee.tee[0] : holeTee.tee;
      courseRating = t.course_rating;
      slopeRating = t.slope_rating;
      par = t.par;
    }
  }

  if (courseRating == null) {
    const { data: trip } = await admin
      .from("trip_settings")
      .select("course_id")
      .eq("id", contest.trip_id)
      .single();

    if (trip?.course_id) {
      const { data: defaultTee } = await admin
        .from("course_tees")
        .select("course_rating, slope_rating, par")
        .eq("course_id", trip.course_id)
        .order("slope_rating", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (defaultTee) {
        courseRating = defaultTee.course_rating;
        slopeRating = defaultTee.slope_rating;
        par = defaultTee.par;
      }
    }
  }

  if (courseRating == null || slopeRating == null || par == null) {
    return NextResponse.json(
      { error: "No course tee found. Assign a tee to the contest or set a course on the trip." },
      { status: 400 }
    );
  }

  // Get all teams with members
  const { data: teams } = await admin
    .from("scramble_teams")
    .select("id, scramble_team_members(user_id)")
    .eq("contest_id", contest_id);

  if (!teams || teams.length === 0) {
    return NextResponse.json({ error: "No teams found" }, { status: 400 });
  }

  // Collect all player IDs
  const allPlayerIds = [
    ...new Set(
      teams.flatMap((t) =>
        ((t.scramble_team_members as { user_id: string }[]) || []).map((m) => m.user_id)
      )
    ),
  ];

  // Get handicap indexes — prefer event-locked, fall back to live
  const handicapMap = new Map<string, number>();

  if (allPlayerIds.length > 0) {
    const { data: eventSnaps } = await admin
      .from("event_player_handicaps")
      .select("user_id, handicap_index")
      .eq("trip_id", contest.trip_id)
      .in("user_id", allPlayerIds);

    for (const s of eventSnaps || []) {
      if (s.handicap_index != null) handicapMap.set(s.user_id, s.handicap_index);
    }

    const missingIds = allPlayerIds.filter((id) => !handicapMap.has(id));
    if (missingIds.length > 0) {
      const { data: liveHandicaps } = await admin
        .from("player_handicaps")
        .select("user_id, handicap_index")
        .in("user_id", missingIds);
      for (const h of liveHandicaps || []) {
        if (h.handicap_index != null) handicapMap.set(h.user_id, h.handicap_index);
      }
    }
  }

  // Calculate team handicaps
  const results: { team_id: string; team_handicap: number; member_count: number }[] = [];

  for (const team of teams) {
    const members = (team.scramble_team_members as { user_id: string }[]) || [];
    if (members.length === 0) {
      results.push({ team_id: team.id, team_handicap: 0, member_count: 0 });
      continue;
    }

    // Convert each player's index to Course Handicap, sort lowest first
    const courseHandicaps = members
      .map((m) => {
        const hi = handicapMap.get(m.user_id) ?? 0;
        return calculateCourseHandicap(hi, slopeRating!, courseRating!, par!);
      })
      .sort((a, b) => a - b);

    const weights = SCRAMBLE_WEIGHTS[courseHandicaps.length] || SCRAMBLE_WEIGHTS[4];

    let teamHC = 0;
    for (let i = 0; i < courseHandicaps.length && i < weights.length; i++) {
      teamHC += courseHandicaps[i] * weights[i];
    }

    results.push({
      team_id: team.id,
      team_handicap: Math.round(teamHC),
      member_count: members.length,
    });
  }

  // Batch update all teams
  await Promise.all(
    results.map((r) =>
      admin
        .from("scramble_teams")
        .update({ team_handicap: r.team_handicap })
        .eq("id", r.team_id)
    )
  );

  return NextResponse.json({ success: true, teams: results });
}
