import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateCourseHandicap } from "@/lib/golf/calculator";

/**
 * @swagger
 * /api/rounds/{id}/handicaps:
 *   get:
 *     summary: Course Handicap for each Loozer on a round (for live "pops" display)
 *     description: >
 *       Returns the Course Handicap of every roster row that is a Loozer with an
 *       established Handicap Index playing on a rated tee. Guests and players
 *       without an index are omitted (they receive no pops). The live scorer
 *       uses this to allocate handicap strokes relative to the group's lowest.
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Per-player Course Handicaps
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: roundId } = await params;

  const { data: rps } = await supabase
    .from("round_players")
    .select("id, user_id, tee_id")
    .eq("round_id", roundId);

  const userIds = [
    ...new Set((rps || []).map((r) => r.user_id).filter((u): u is string => !!u)),
  ];
  const teeIds = [
    ...new Set((rps || []).map((r) => r.tee_id).filter((t): t is string => !!t)),
  ];

  if (userIds.length === 0 || teeIds.length === 0) {
    return NextResponse.json({ handicaps: [] });
  }

  const [{ data: hcaps }, { data: tees }] = await Promise.all([
    supabase
      .from("player_handicaps")
      .select("user_id, handicap_index")
      .in("user_id", userIds),
    supabase
      .from("course_tees")
      .select("id, course_rating, slope_rating, par")
      .in("id", teeIds),
  ]);

  const hiByUser = new Map((hcaps || []).map((h) => [h.user_id, h.handicap_index]));
  const teeById = new Map((tees || []).map((t) => [t.id, t]));

  const handicaps = (rps || [])
    .map((r) => {
      if (!r.user_id || !r.tee_id) return null;
      const hi = hiByUser.get(r.user_id);
      const tee = teeById.get(r.tee_id);
      if (hi == null || !tee) return null;
      return {
        round_player_id: r.id,
        user_id: r.user_id,
        course_handicap: calculateCourseHandicap(
          hi,
          tee.slope_rating,
          tee.course_rating,
          tee.par
        ),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ handicaps });
}
