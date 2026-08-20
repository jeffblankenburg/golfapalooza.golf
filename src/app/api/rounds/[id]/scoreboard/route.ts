import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHolesForTee } from "@/lib/golf/composition-tees";

/**
 * @swagger
 * /api/rounds/{id}/scoreboard:
 *   get:
 *     summary: Read-only scoreboard data for a round (holes + players + scores)
 *     description: >
 *       Powers the in-scorer "other groups on this course" overlay and any
 *       compact spectator card. Returns the same shape the LiveScoreboard
 *       component consumes. Watchable by any signed-in Loozer.
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Round meta, holes, and per-player scores }
 *       401: { description: Unauthorized }
 *       404: { description: Round not found }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: round } = await admin
    .from("rounds")
    .select(
      `
      id, round_type, status, tee_id,
      course:courses(name),
      round_players(
        id, user_id, guest_name, player_position,
        user:users(id, display_name),
        scores:round_scores(hole_number, strokes)
      )
    `,
    )
    .eq("id", id)
    .order("player_position", { referencedTable: "round_players", ascending: true })
    .single();

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const course = Array.isArray(round.course) ? round.course[0] : round.course;

  const { data: holeRows } = await resolveHolesForTee(admin, round.tee_id, "hole_number, par");
  const holes = ((holeRows || []) as { hole_number: number; par: number }[]).map((h) => ({
    hole_number: h.hole_number,
    par: h.par,
  }));

  type RP = {
    id: string;
    user_id: string | null;
    guest_name: string | null;
    user: { id: string; display_name: string } | { id: string; display_name: string }[] | null;
    scores: { hole_number: number; strokes: number }[] | null;
  };

  const players = ((round.round_players || []) as RP[]).map((p) => {
    const u = p.user ? (Array.isArray(p.user) ? p.user[0] : p.user) : null;
    return {
      round_player_id: p.id,
      name: u?.display_name || p.guest_name || "Guest",
      is_guest: !p.user_id,
      scores: p.scores || [],
    };
  });

  return NextResponse.json({
    round: {
      id: round.id,
      round_type: round.round_type,
      status: round.status,
      course_name: course?.name || "Round",
    },
    holes,
    players,
  });
}
