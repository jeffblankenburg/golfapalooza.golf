import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnyPermissionAccess } from "@/lib/permissions-server";
import { isRoundIncomplete, expectedHoleCount } from "@/lib/rounds/incomplete";

/**
 * @swagger
 * /api/admin/users/{userId}/scorecards:
 *   get:
 *     summary: List a user's completed scorecards with hole-by-hole scores (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of scorecards (most recent first); each includes the user's per-hole scores plus tee/par per hole.
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await checkAnyPermissionAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const supabase = createAdminClient();

  const { data: players, error } = await supabase
    .from("round_players")
    .select(`
      id,
      tee_id,
      final_gross_score,
      final_adjusted_score,
      score_differential,
      round:rounds!inner(
        id,
        round_type,
        status,
        completed_at,
        created_at,
        course:courses(id, name)
      ),
      tee:course_tees(id, tee_name, tee_color, par),
      scores:round_scores(hole_number, strokes)
    `)
    .eq("user_id", userId)
    .eq("round.status", "completed")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const teeIds = [
    ...new Set(
      (players || [])
        .map((p) => p.tee_id)
        .filter((id): id is string => !!id)
    ),
  ];

  let holesByTee = new Map<string, { hole_number: number; par: number; yards: number | null; handicap_index: number }[]>();
  if (teeIds.length > 0) {
    const { data: holes } = await supabase
      .from("course_holes")
      .select("tee_id, hole_number, par, yards, handicap_index")
      .in("tee_id", teeIds)
      .order("hole_number", { ascending: true });
    holesByTee = (holes || []).reduce((acc, h) => {
      const arr = acc.get(h.tee_id) || [];
      arr.push({ hole_number: h.hole_number, par: h.par, yards: h.yards, handicap_index: h.handicap_index });
      acc.set(h.tee_id, arr);
      return acc;
    }, new Map<string, { hole_number: number; par: number; yards: number | null; handicap_index: number }[]>());
  }

  const scorecards = (players || []).map((p) => {
    const round = Array.isArray(p.round) ? p.round[0] : p.round;
    const tee = Array.isArray(p.tee) ? p.tee[0] : p.tee;
    const course = round?.course
      ? (Array.isArray(round.course) ? round.course[0] : round.course)
      : null;
    const holes = p.tee_id ? holesByTee.get(p.tee_id) || [] : [];
    const scoreByHole: Record<number, number> = {};
    for (const s of p.scores || []) {
      scoreByHole[s.hole_number] = s.strokes;
    }
    const roundType = round?.round_type || "18";
    const holesPlayed = (p.scores || []).length;
    return {
      round_player_id: p.id,
      round_id: round?.id || null,
      played_at: round?.completed_at || round?.created_at || null,
      round_type: roundType,
      course_name: course?.name || "Unknown course",
      tee_name: tee?.tee_name || null,
      tee_color: tee?.tee_color || null,
      par: tee?.par ?? null,
      final_gross_score: p.final_gross_score,
      final_adjusted_score: p.final_adjusted_score,
      score_differential: p.score_differential,
      is_incomplete: isRoundIncomplete(roundType, holesPlayed, p.final_gross_score != null),
      holes_played: holesPlayed,
      expected_holes: expectedHoleCount(roundType),
      holes,
      scores: scoreByHole,
    };
  });

  return NextResponse.json({ scorecards });
}
