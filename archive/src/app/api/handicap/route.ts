import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateHandicapIndex, calculateDifferential } from "@/lib/handicap/calculator";
import type { RoundDifferential } from "@/types/golf";

/**
 * @swagger
 * /api/handicap:
 *   get:
 *     summary: Get current handicap
 *     description: Get the current user's handicap index and recent rounds
 *     tags: [Handicap]
 *     responses:
 *       200:
 *         description: Current handicap data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 handicap:
 *                   $ref: '#/components/schemas/PlayerHandicap'
 *                 recent_rounds:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       score_differential:
 *                         type: number
 *                       final_adjusted_score:
 *                         type: integer
 *                       round:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           round_date:
 *                             type: string
 *                             format: date
 *                           course:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                           tee:
 *                             type: object
 *                             properties:
 *                               course_rating:
 *                                 type: number
 *                               slope_rating:
 *                                 type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get current handicap
    const { data: handicap } = await supabase
      .from("player_handicaps")
      .select("*")
      .eq("user_id", user.id)
      .single();

    // Get recent rounds for context
    const { data: recentRounds } = await supabase
      .from("round_players")
      .select(
        `
        score_differential,
        final_adjusted_score,
        round:rounds(
          id,
          round_date,
          course:courses(name),
          tee:course_tees(course_rating, slope_rating)
        )
      `
      )
      .eq("user_id", user.id)
      .not("score_differential", "is", null)
      .order("round(round_date)", { ascending: false })
      .limit(20);

    return NextResponse.json({
      handicap: handicap || null,
      recent_rounds: recentRounds || [],
    });
  } catch (error) {
    console.error("Error fetching handicap:", error);
    return NextResponse.json(
      { error: "Failed to fetch handicap" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/handicap:
 *   post:
 *     summary: Recalculate handicap
 *     description: Recalculate the user's handicap index from their last 20 completed rounds using USGA World Handicap System
 *     tags: [Handicap]
 *     responses:
 *       200:
 *         description: Handicap calculation result
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     handicap:
 *                       type: object
 *                       properties:
 *                         handicap_index:
 *                           type: number
 *                         low_handicap_index:
 *                           type: number
 *                         rounds_used:
 *                           type: integer
 *                         calculation_method:
 *                           type: string
 *                         differentials:
 *                           type: array
 *                           items:
 *                             type: object
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: false
 *                     message:
 *                       type: string
 *                       example: "Need at least 3 completed rounds to calculate handicap"
 *                     rounds_count:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch last 20 completed rounds with differentials
    const { data: rounds, error: roundsError } = await supabase
      .from("round_players")
      .select(
        `
        id,
        final_adjusted_score,
        score_differential,
        round:rounds!inner(
          id,
          round_date,
          status,
          course:courses(name),
          tee:course_tees(course_rating, slope_rating)
        )
      `
      )
      .eq("user_id", user.id)
      .eq("round.status", "completed")
      .not("final_adjusted_score", "is", null)
      .order("round(round_date)", { ascending: false })
      .limit(20);

    if (roundsError) {
      console.error("Error fetching rounds:", roundsError);
      return NextResponse.json({ error: roundsError.message }, { status: 500 });
    }

    if (!rounds || rounds.length < 3) {
      return NextResponse.json({
        success: false,
        message: "Need at least 3 completed rounds to calculate handicap",
        rounds_count: rounds?.length || 0,
      });
    }

    // Build differentials array
    const differentials: RoundDifferential[] = rounds.map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const roundData = r.round as any;
      const round = {
        id: roundData.id as string,
        round_date: roundData.round_date as string,
        course_name: roundData.course?.name as string,
        course_rating: roundData.tee?.course_rating as number,
        slope_rating: roundData.tee?.slope_rating as number,
      };

      // Recalculate differential to ensure accuracy
      const differential = calculateDifferential(
        r.final_adjusted_score!,
        round.course_rating,
        round.slope_rating
      );

      return {
        round_id: round.id,
        round_date: round.round_date,
        course_name: round.course_name,
        adjusted_gross_score: r.final_adjusted_score!,
        course_rating: round.course_rating,
        slope_rating: round.slope_rating,
        differential,
      };
    });

    // Calculate handicap index
    const calculation = calculateHandicapIndex(differentials);

    if (!calculation) {
      return NextResponse.json({
        success: false,
        message: "Unable to calculate handicap",
      });
    }

    // Upsert player handicap
    const { error: upsertError } = await supabase
      .from("player_handicaps")
      .upsert(
        {
          user_id: user.id,
          handicap_index: calculation.handicap_index,
          low_handicap_index: calculation.low_handicap_index,
          rounds_used: calculation.rounds_used,
          last_calculated_at: new Date().toISOString(),
          effective_date: new Date().toISOString().split("T")[0],
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("Error saving handicap:", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    // Create history record
    await supabase.from("handicap_history").insert({
      user_id: user.id,
      handicap_index: calculation.handicap_index,
      rounds_used: calculation.rounds_used,
      differentials_used: calculation.differentials.map((d) => d.differential),
      calculation_method: calculation.calculation_method,
      effective_date: new Date().toISOString().split("T")[0],
    });

    return NextResponse.json({
      success: true,
      handicap: calculation,
    });
  } catch (error) {
    console.error("Error calculating handicap:", error);
    return NextResponse.json(
      { error: "Failed to calculate handicap" },
      { status: 500 }
    );
  }
}
