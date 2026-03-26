import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ScoreUpdate } from "@/types/golf";

/**
 * @swagger
 * /api/rounds/{roundId}/scores:
 *   get:
 *     summary: Get round scores
 *     description: Get all scores for all players in a round
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
 *         description: All scores for the round
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 scores:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RoundScore'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function GET(
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
    const { data: scores, error } = await supabase
      .from("round_scores")
      .select(
        `
        *,
        round_player:round_players(
          id,
          user_id,
          player_position,
          user:users(display_name)
        )
      `
      )
      .eq("round_id", roundId)
      .order("hole_number");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ scores });
  } catch (error) {
    console.error("Error fetching scores:", error);
    return NextResponse.json(
      { error: "Failed to fetch scores" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/rounds/{roundId}/scores:
 *   put:
 *     summary: Batch update scores
 *     description: Update multiple hole scores at once
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: roundId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [scores]
 *             properties:
 *               scores:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/ScoreUpdate'
 *     responses:
 *       200:
 *         description: Scores updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 updated:
 *                   type: integer
 *       400:
 *         description: Invalid scores data
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function PUT(
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
    const body: { scores: ScoreUpdate[] } = await request.json();

    if (!body.scores || !Array.isArray(body.scores)) {
      return NextResponse.json(
        { error: "Invalid scores data" },
        { status: 400 }
      );
    }

    // Update each score
    const results = await Promise.all(
      body.scores.map(async (score) => {
        const updates: Record<string, unknown> = {};

        if (score.strokes !== undefined) updates.strokes = score.strokes;
        if (score.putts !== undefined) updates.putts = score.putts;
        if (score.fairway_hit !== undefined)
          updates.fairway_hit = score.fairway_hit;
        if (score.green_in_regulation !== undefined)
          updates.green_in_regulation = score.green_in_regulation;
        if (score.penalty_strokes !== undefined)
          updates.penalty_strokes = score.penalty_strokes;

        const { error } = await supabase
          .from("round_scores")
          .update(updates)
          .eq("round_id", roundId)
          .eq("round_player_id", score.round_player_id)
          .eq("hole_number", score.hole_number);

        return { score, error };
      })
    );

    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      console.error("Score update errors:", errors);
      return NextResponse.json(
        { error: "Some scores failed to update", details: errors },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, updated: results.length });
  } catch (error) {
    console.error("Error updating scores:", error);
    return NextResponse.json(
      { error: "Failed to update scores" },
      { status: 500 }
    );
  }
}
