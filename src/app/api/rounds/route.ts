import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CreateRoundRequest } from "@/types/golf";

/**
 * @swagger
 * /api/rounds:
 *   get:
 *     summary: List user's rounds
 *     description: Get a list of rounds created by or including the current user
 *     tags: [Rounds]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [in_progress, completed, cancelled]
 *         description: Filter by round status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of rounds to return
 *     responses:
 *       200:
 *         description: List of rounds
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rounds:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Round'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
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
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "20");

  try {
    let query = supabase
      .from("rounds")
      .select(
        `
        *,
        course:courses(id, name, city, state),
        tee:course_tees(id, tee_name, par),
        players:round_players(
          id,
          user_id,
          final_gross_score,
          score_differential,
          user:users(id, display_name)
        )
      `
      )
      .or(`created_by.eq.${user.id},players.user_id.eq.${user.id}`)
      .order("round_date", { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: rounds, error } = await query;

    if (error) {
      console.error("Error fetching rounds:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rounds });
  } catch (error) {
    console.error("Error fetching rounds:", error);
    return NextResponse.json(
      { error: "Failed to fetch rounds" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/rounds:
 *   post:
 *     summary: Create a new round
 *     description: Create a new scoring round with players
 *     tags: [Rounds]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoundRequest'
 *     responses:
 *       200:
 *         description: Round created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 round:
 *                   $ref: '#/components/schemas/Round'
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: CreateRoundRequest = await request.json();

    if (!body.course_id || !body.tee_id || !body.round_type) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create the round
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .insert({
        created_by: user.id,
        course_id: body.course_id,
        tee_id: body.tee_id,
        round_type: body.round_type,
        round_date: body.round_date || new Date().toISOString().split("T")[0],
        status: "in_progress",
      })
      .select()
      .single();

    if (roundError) {
      console.error("Error creating round:", roundError);
      return NextResponse.json({ error: roundError.message }, { status: 500 });
    }

    // Add players to the round
    const players = body.players || [
      { user_id: user.id, tee_id: body.tee_id, is_scorer: true },
    ];

    const playerInserts = players.map((player, index) => ({
      round_id: round.id,
      user_id: player.user_id,
      tee_id: player.tee_id,
      player_position: index + 1,
      is_scorer: player.is_scorer || index === 0,
    }));

    const { error: playersError } = await supabase
      .from("round_players")
      .insert(playerInserts);

    if (playersError) {
      console.error("Error adding players:", playersError);
      // Clean up the round if players failed
      await supabase.from("rounds").delete().eq("id", round.id);
      return NextResponse.json({ error: playersError.message }, { status: 500 });
    }

    // Pre-create empty score records for all holes
    const { data: holes } = await supabase
      .from("course_holes")
      .select("hole_number")
      .eq("tee_id", body.tee_id)
      .order("hole_number");

    if (holes && holes.length > 0) {
      const { data: roundPlayers } = await supabase
        .from("round_players")
        .select("id")
        .eq("round_id", round.id);

      if (roundPlayers) {
        const scoreInserts = roundPlayers.flatMap((player) =>
          holes.map((hole) => ({
            round_id: round.id,
            round_player_id: player.id,
            hole_number: hole.hole_number,
          }))
        );

        await supabase.from("round_scores").insert(scoreInserts);
      }
    }

    return NextResponse.json({ round, success: true });
  } catch (error) {
    console.error("Error creating round:", error);
    return NextResponse.json(
      { error: "Failed to create round" },
      { status: 500 }
    );
  }
}
