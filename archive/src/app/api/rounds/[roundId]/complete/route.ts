import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  calculateDifferential,
  calculateAdjustedGrossScore,
  calculateCourseHandicap,
} from "@/lib/handicap/calculator";

interface ScoreRecord {
  hole_number: number;
  strokes: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  green_in_regulation: boolean | null;
}

interface HoleRecord {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number;
}

/**
 * @swagger
 * /api/rounds/{roundId}/complete:
 *   post:
 *     summary: Complete a round
 *     description: Mark a round as completed and calculate final scores, adjusted scores, and handicap differentials for all players
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: roundId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Round completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Round already completed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Round not found
 *       500:
 *         description: Server error
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roundId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { roundId } = await params;

  try {
    // Fetch the round with all related data
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select(
        `
        *,
        tee:course_tees(*),
        players:round_players(
          *,
          tee:course_tees(*),
          scores:round_scores(*)
        )
      `
      )
      .eq("id", roundId)
      .eq("created_by", user.id)
      .single();

    if (roundError || !round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    if (round.status === "completed") {
      return NextResponse.json(
        { error: "Round already completed" },
        { status: 400 }
      );
    }

    // Process each player
    for (const player of round.players) {
      const tee = player.tee;
      const scores = player.scores || [];

      // Get hole data for this tee
      const { data: holes } = await supabase
        .from("course_holes")
        .select("*")
        .eq("tee_id", tee.id)
        .order("hole_number");

      if (!holes || holes.length === 0) continue;

      // Filter scores based on round type
      let relevantHoles = holes as HoleRecord[];
      if (round.round_type === "9-front") {
        relevantHoles = holes.filter((h: HoleRecord) => h.hole_number <= 9);
      } else if (round.round_type === "9-back") {
        relevantHoles = holes.filter((h: HoleRecord) => h.hole_number > 9);
      }

      // Calculate gross score
      const relevantScores = (scores as ScoreRecord[]).filter((s: ScoreRecord) =>
        relevantHoles.some((h: HoleRecord) => h.hole_number === s.hole_number)
      );

      const grossScore = relevantScores.reduce(
        (sum: number, s: ScoreRecord) => sum + (s.strokes || 0),
        0
      );

      // Get player's handicap for adjusted score calculation
      const { data: handicapData } = await supabase
        .from("player_handicaps")
        .select("handicap_index")
        .eq("user_id", player.user_id)
        .single();

      const handicapIndex = handicapData?.handicap_index || 0;

      // Calculate course handicap
      let courseRating = tee.course_rating;
      let slopeRating = tee.slope_rating;

      // Use 9-hole ratings if available for 9-hole rounds
      if (round.round_type === "9-front" && tee.front_nine_rating) {
        courseRating = tee.front_nine_rating;
        slopeRating = tee.front_nine_slope || tee.slope_rating;
      } else if (round.round_type === "9-back" && tee.back_nine_rating) {
        courseRating = tee.back_nine_rating;
        slopeRating = tee.back_nine_slope || tee.slope_rating;
      } else if (round.round_type !== "18") {
        // Estimate 9-hole values
        courseRating = tee.course_rating / 2;
      }

      const par = relevantHoles.reduce((sum, h) => sum + h.par, 0);
      const courseHandicap = calculateCourseHandicap(
        handicapIndex,
        slopeRating,
        courseRating,
        par
      );

      // Calculate adjusted gross score (Net Double Bogey)
      const scoreData = relevantScores
        .filter((s: ScoreRecord) => s.strokes !== null)
        .map((s: ScoreRecord) => {
          const hole = relevantHoles.find((h: HoleRecord) => h.hole_number === s.hole_number);
          return {
            strokes: s.strokes!,
            par: hole?.par || 4,
            handicap_index: hole?.handicap_index || 1,
          };
        });

      const adjustedGrossScore =
        scoreData.length > 0
          ? calculateAdjustedGrossScore(scoreData, courseHandicap)
          : grossScore;

      // Calculate score differential
      const differential = calculateDifferential(
        adjustedGrossScore,
        courseRating,
        slopeRating
      );

      // Update round_player with final scores
      await supabase
        .from("round_players")
        .update({
          playing_handicap: courseHandicap,
          final_gross_score: grossScore,
          final_adjusted_score: adjustedGrossScore,
          final_net_score: grossScore - courseHandicap,
          score_differential: differential,
        })
        .eq("id", player.id);
    }

    // Mark round as completed
    const { error: updateError } = await supabase
      .from("rounds")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", roundId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Round completed" });
  } catch (error) {
    console.error("Error completing round:", error);
    return NextResponse.json(
      { error: "Failed to complete round" },
      { status: 500 }
    );
  }
}
