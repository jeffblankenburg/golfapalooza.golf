import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * @swagger
 * /api/rounds/{roundId}:
 *   get:
 *     summary: Get round details
 *     description: Get full details of a round including course, tees, players, and scores
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: roundId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The round ID
 *     responses:
 *       200:
 *         description: Round details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 round:
 *                   allOf:
 *                     - $ref: '#/components/schemas/Round'
 *                     - type: object
 *                       properties:
 *                         course:
 *                           $ref: '#/components/schemas/Course'
 *                         tee:
 *                           $ref: '#/components/schemas/CourseTee'
 *                         players:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/RoundPlayer'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Round not found
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
    const { data: round, error } = await supabase
      .from("rounds")
      .select(
        `
        *,
        course:courses(*),
        tee:course_tees(*, holes:course_holes(*)),
        players:round_players(
          *,
          user:users(id, display_name, full_name),
          tee:course_tees(*, holes:course_holes(*)),
          scores:round_scores(*)
        )
      `
      )
      .eq("id", roundId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Round not found" }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sort players by position and scores by hole number
    if (round.players) {
      round.players.sort(
        (a: { player_position: number }, b: { player_position: number }) =>
          a.player_position - b.player_position
      );
      round.players.forEach(
        (player: { scores: { hole_number: number }[] }) => {
          if (player.scores) {
            player.scores.sort(
              (a: { hole_number: number }, b: { hole_number: number }) =>
                a.hole_number - b.hole_number
            );
          }
        }
      );
    }

    return NextResponse.json({ round });
  } catch (error) {
    console.error("Error fetching round:", error);
    return NextResponse.json(
      { error: "Failed to fetch round" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/rounds/{roundId}:
 *   put:
 *     summary: Update round
 *     description: Update round details (notes, weather, status)
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: roundId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               weather_conditions:
 *                 type: string
 *               notes:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [in_progress, completed, cancelled]
 *     responses:
 *       200:
 *         description: Round updated
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
    const body = await request.json();

    // Only allow updating certain fields
    const updates: Record<string, unknown> = {};
    if (body.weather_conditions !== undefined)
      updates.weather_conditions = body.weather_conditions;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.status !== undefined) updates.status = body.status;

    const { data: round, error } = await supabase
      .from("rounds")
      .update(updates)
      .eq("id", roundId)
      .eq("created_by", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ round, success: true });
  } catch (error) {
    console.error("Error updating round:", error);
    return NextResponse.json(
      { error: "Failed to update round" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/rounds/{roundId}:
 *   delete:
 *     summary: Delete round
 *     description: Delete a round and all associated data
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
 *         description: Round deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function DELETE(
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
    const { error } = await supabase
      .from("rounds")
      .delete()
      .eq("id", roundId)
      .eq("created_by", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting round:", error);
    return NextResponse.json(
      { error: "Failed to delete round" },
      { status: 500 }
    );
  }
}
