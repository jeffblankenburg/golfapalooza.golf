import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { calculateCourseHandicap } from "@/lib/golf/calculator";

/**
 * POST - Auto-calculate 2-man scramble handicaps for all KGB Cup pairs.
 *
 * Formula: 35% of lower Course Handicap + 15% of higher Course Handicap, rounded.
 * Uses event-locked handicaps when available, falling back to live handicaps.
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

  // Get contest and trip info
  const { data: contest } = await admin
    .from("contests")
    .select("trip_id")
    .eq("id", contest_id)
    .single();

  if (!contest) {
    return NextResponse.json({ error: "Contest not found" }, { status: 404 });
  }

  // Get tee ratings for Course Handicap conversion.
  // Try contest_hole_tees first (KGB Cup assigns tees per hole), then fall back to
  // contest_tees, then to the trip's course default tee.
  let courseRating: number | null = null;
  let slopeRating: number | null = null;
  let par: number | null = null;

  // 1. Try contest_hole_tees — use the first assigned tee's ratings
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

  // 2. Try contest_tees
  if (courseRating == null) {
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
  }

  // 3. Fall back to trip's course default tee
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
      { error: "No course tee found. Assign hole tees to the contest or set a course on the trip." },
      { status: 400 }
    );
  }

  // Get all pairs with player IDs
  const { data: teamsData } = await admin
    .from("ryder_cup_teams")
    .select("id")
    .eq("contest_id", contest_id);

  const teamIds = (teamsData || []).map((t) => t.id);
  if (teamIds.length === 0) {
    return NextResponse.json({ error: "No teams found" }, { status: 400 });
  }

  const { data: pairs } = await admin
    .from("ryder_cup_pairs")
    .select("id, player_a_id, player_b_id, player_c_id")
    .in("team_id", teamIds);

  if (!pairs || pairs.length === 0) {
    return NextResponse.json({ error: "No pairs found" }, { status: 400 });
  }

  // Collect all player IDs
  const allPlayerIds = [
    ...new Set(
      pairs
        .flatMap((p) => [p.player_a_id, p.player_b_id, p.player_c_id])
        .filter(Boolean) as string[]
    ),
  ];

  // Get handicap indexes — prefer event-locked, fall back to live
  const handicapMap = new Map<string, number>();

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

  // Calculate pair scramble handicaps and upsert
  const results: { pair_id: string; scramble_handicap: number; player_a_ch: number; player_b_ch: number }[] = [];

  for (const pair of pairs) {
    const hiA = handicapMap.get(pair.player_a_id!) ?? 0;
    const hiB = pair.player_b_id ? (handicapMap.get(pair.player_b_id) ?? 0) : 0;

    const chA = calculateCourseHandicap(hiA, slopeRating, courseRating, par);
    const chB = calculateCourseHandicap(hiB, slopeRating, courseRating, par);

    const lower = Math.min(chA, chB);
    const higher = Math.max(chA, chB);
    const scrambleHandicap = Math.round(lower * 0.35 + higher * 0.15);

    results.push({
      pair_id: pair.id,
      scramble_handicap: scrambleHandicap,
      player_a_ch: chA,
      player_b_ch: chB,
    });
  }

  // Upsert all pair handicaps
  const rows = results.map((r) => ({
    contest_id,
    pair_id: r.pair_id,
    scramble_handicap: r.scramble_handicap,
  }));

  const { error } = await admin
    .from("kgb_cup_pair_handicaps")
    .upsert(rows, { onConflict: "contest_id,pair_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, pairs: results });
}
