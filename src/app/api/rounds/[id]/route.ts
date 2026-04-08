import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateDifferential } from "@/lib/golf/calculator";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - Fetch round with full details
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: round, error } = await supabase
    .from("rounds")
    .select(`
      *,
      course:courses(*),
      tee:course_tees(*),
      round_players(
        *,
        user:users(id, display_name, full_name),
        scores:round_scores(*)
      )
    `)
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  // Also fetch hole data for the tee
  const teeId = round.tee_id;
  const { data: holes } = await supabase
    .from("course_holes")
    .select("*")
    .eq("tee_id", teeId)
    .order("hole_number");

  // Backfill missing differentials for any player with a score but no differential
  const tee = Array.isArray(round.tee) ? round.tee[0] : round.tee;
  const playersNeedingDiff = (round.round_players || []).filter(
    (p: { final_gross_score: number | null; score_differential: number | null }) =>
      p.final_gross_score != null && p.score_differential == null
  );

  if (tee && playersNeedingDiff.length > 0) {
    await Promise.all(
      playersNeedingDiff.map((p: { id: string; final_gross_score: number; score_differential: number | null }) => {
        const diff = calculateDifferential(p.final_gross_score, tee.course_rating, tee.slope_rating);
        // Update in DB
        supabase.from("round_players").update({ score_differential: diff }).eq("id", p.id);
        // Patch the response object so the client sees it immediately
        p.score_differential = diff;
        return Promise.resolve();
      })
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  return NextResponse.json({ round, holes: holes || [], current_user_id: effectiveUserId });
}

// PUT - Update round (metadata or complete it)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { status, notes, final_gross_score } = body;

    const updateData: Record<string, unknown> = {};
    if (notes !== undefined) updateData.notes = notes;

    // Handle completing a round
    if (status === "completed") {
      updateData.status = "completed";
      updateData.completed_at = new Date().toISOString();

      // Get the round player and tee info
      const { data: round } = await supabase
        .from("rounds")
        .select("tee_id, created_by")
        .eq("id", id)
        .single();

      if (round) {
        const { data: tee } = await supabase
          .from("course_tees")
          .select("course_rating, slope_rating")
          .eq("id", round.tee_id)
          .single();

        // Calculate differential for ALL players in the round
        const { data: allPlayers } = await supabase
          .from("round_players")
          .select("id, final_gross_score")
          .eq("round_id", id);

        if (tee && allPlayers) {
          const updates = allPlayers
            .filter((p) => p.final_gross_score != null)
            .map((p) => {
              const differential = calculateDifferential(
                p.final_gross_score!,
                tee.course_rating,
                tee.slope_rating
              );
              return supabase
                .from("round_players")
                .update({ score_differential: differential })
                .eq("id", p.id);
            });

          await Promise.all(updates);
        }

        // Update creator's gross score if provided
        if (final_gross_score != null) {
          const { data: creator } = await supabase
            .from("round_players")
            .select("id")
            .eq("round_id", id)
            .eq("user_id", round.created_by)
            .single();

          if (creator) {
            const differential = tee
              ? calculateDifferential(final_gross_score, tee.course_rating, tee.slope_rating)
              : null;
            await supabase
              .from("round_players")
              .update({ final_gross_score, score_differential: differential })
              .eq("id", creator.id);
          }
        }
      }
    } else if (status) {
      updateData.status = status;
    }

    const { error } = await supabase
      .from("rounds")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update round" }, { status: 500 });
  }
}

// DELETE - Delete a round
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from("rounds")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
