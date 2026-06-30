import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateDifferential, calculateAdjustedGrossScore, calculateCourseHandicap } from "@/lib/golf/calculator";
import { recalculateHandicap } from "@/lib/golf/handicap";
import { resolveHolesForTee } from "@/lib/golf/composition-tees";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkIsAdmin } from "@/lib/permissions-server";
import { canManageRound } from "@/lib/rounds/access";

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

  // Round details are viewable by any authenticated Loozer (they're already
  // surfaced on the public Loozer profile scorecards accordion). Auth gate
  // above is enforced; switch to the admin client for the actual fetch so
  // RLS doesn't 404 when the viewer isn't the round's creator or a player.
  // Mutation routes (PUT/DELETE) below keep the RLS-bound client.
  const adminClient = createAdminClient();
  const { data: round, error } = await adminClient
    .from("rounds")
    .select(`
      *,
      course:courses(*),
      tee:course_tees(*),
      round_players(
        *,
        user:users(id, display_name, full_name),
        player_tee:course_tees(id, tee_name, tee_color, course_rating, slope_rating, par),
        scores:round_scores(*)
      )
    `)
    .eq("id", id)
    .order("player_position", { referencedTable: "round_players", ascending: true })
    .single();

  if (error) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  // Fetch hole data — use the current user's tee override if different from round tee
  const effectiveUserId = await getEffectiveUserId(user.id);
  const currentPlayer = (round.round_players || []).find(
    (p: { user_id: string }) => p.user_id === effectiveUserId
  );
  const holeTeeId = currentPlayer?.tee_id || round.tee_id;
  const { data: holes } = await resolveHolesForTee(supabase, holeTeeId, "*");

  // Backfill missing differentials only for full 18-hole rounds — 9-hole
  // and partial rounds aren't WHS-eligible against an 18-hole rating/slope.
  const tee = Array.isArray(round.tee) ? round.tee[0] : round.tee;
  if (tee && (round.round_type ?? "18") === "18") {
    const playersNeedingDiff = (round.round_players || []).filter(
      (p: { user_id: string | null; final_gross_score: number | null; score_differential: number | null; scores?: unknown[] }) => {
        // Guests have no handicap, so never get a differential.
        if (!p.user_id) return false;
        if (p.final_gross_score == null || p.score_differential != null) return false;
        // If hole scores exist, require all 18 before backfilling.
        const holeCount = Array.isArray(p.scores) ? p.scores.length : 0;
        return holeCount === 0 || holeCount >= 18;
      },
    );

    if (playersNeedingDiff.length > 0) {
      await Promise.all(
        playersNeedingDiff.map((p: { id: string; final_gross_score: number; score_differential: number | null }) => {
          const diff = calculateDifferential(p.final_gross_score, tee.course_rating, tee.slope_rating);
          supabase.from("round_players").update({ score_differential: diff }).eq("id", p.id);
          p.score_differential = diff;
          return Promise.resolve();
        }),
      );
    }
  }

  const adminUser = await checkIsAdmin();
  return NextResponse.json({
    round,
    holes: holes || [],
    current_user_id: effectiveUserId,
    is_admin: !!adminUser,
  });
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
  const effectiveUserId = await getEffectiveUserId(user.id);

  // Co-equal ownership (issue #130): any player in the round, or an admin,
  // can manage the round. Writes route through the admin client so simulator
  // mode and non-creator scorers don't get silently no-op'd by RLS.
  const access = await canManageRound(id, effectiveUserId);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Round not found" : "Forbidden" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }
  const adminClient = createAdminClient();

  try {
    const body = await request.json();
    const { status, notes, final_gross_score } = body;

    const updateData: Record<string, unknown> = {};
    if (notes !== undefined) updateData.notes = notes;

    // Handle completing a round
    if (status === "completed") {
      // Flip status to "completed" BEFORE calculating differentials and
      // recalculating handicaps. recalculateHandicap filters by
      // round.status = 'completed', so the just-completed round must already
      // be flagged in the DB to be counted in its own recalc.
      const { error: completeError } = await adminClient
        .from("rounds")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", id);
      if (completeError) {
        return NextResponse.json({ error: completeError.message }, { status: 500 });
      }

      // Get the round and all player info
      const { data: round } = await adminClient
        .from("rounds")
        .select("tee_id, created_by, round_type")
        .eq("id", id)
        .single();

      const is18 = (round?.round_type ?? "18") === "18";

      if (round) {
        // Fetch all players and their tee data
        const { data: allPlayers } = await adminClient
          .from("round_players")
          .select("id, user_id, tee_id, final_gross_score")
          .eq("round_id", id);

        // Update creator's gross score if provided (Quick Entry from live scoring)
        if (final_gross_score != null) {
          const creator = (allPlayers || []).find((p) => p.user_id === round.created_by);
          if (creator) {
            creator.final_gross_score = final_gross_score;
            await adminClient
              .from("round_players")
              .update({ final_gross_score })
              .eq("id", creator.id);
          }
        }

        if (allPlayers) {
          // Fetch all tee data needed
          const teeIds = [...new Set(allPlayers.map((p) => p.tee_id).filter(Boolean))];
          const { data: teesData } = await adminClient
            .from("course_tees")
            .select("id, course_rating, slope_rating, par")
            .in("id", teeIds);
          const teeMap = new Map((teesData || []).map((t) => [t.id, t]));

          // Fetch hole scores for all players in one query
          const { data: allScores } = await adminClient
            .from("round_scores")
            .select("round_player_id, hole_number, strokes")
            .eq("round_id", id);

          // Group scores by round_player_id
          const scoresByPlayer = new Map<string, { hole_number: number; strokes: number }[]>();
          for (const s of allScores || []) {
            const arr = scoresByPlayer.get(s.round_player_id) || [];
            arr.push({ hole_number: s.hole_number, strokes: s.strokes });
            scoresByPlayer.set(s.round_player_id, arr);
          }

          // Fetch course holes for tees that have hole scores
          const teeIdsWithScores = [...new Set(
            allPlayers
              .filter((p) => scoresByPlayer.has(p.id))
              .map((p) => p.tee_id)
              .filter(Boolean)
          )];
          const holeDataMap = new Map<string, { hole_number: number; par: number; handicap_index: number }[]>();
          if (teeIdsWithScores.length > 0) {
            const { data: holes } = await adminClient
              .from("course_holes")
              .select("tee_id, hole_number, par, handicap_index")
              .in("tee_id", teeIdsWithScores);
            for (const h of holes || []) {
              const arr = holeDataMap.get(h.tee_id) || [];
              arr.push({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index });
              holeDataMap.set(h.tee_id, arr);
            }
          }

          // Calculate adjusted score and differential for each player
          const playerUserIds = new Set<string>();
          for (const p of allPlayers) {
            // Guests keep their gross total but get no adjusted score,
            // differential, or handicap recalc.
            if (!p.user_id) continue;
            if (p.final_gross_score == null) continue;
            const tee = teeMap.get(p.tee_id);
            if (!tee) continue;

            let scoreForDifferential = p.final_gross_score;
            let adjustedGrossScore: number | null = null;

            // If hole-by-hole scores exist, apply Net Double Bogey adjustment
            const playerScores = scoresByPlayer.get(p.id);
            const courseHoles = holeDataMap.get(p.tee_id);
            if (playerScores && courseHoles && playerScores.length >= 9) {
              // Get player's current handicap for NDB calculation (default 0 if none)
              const { data: playerHcp } = await adminClient
                .from("player_handicaps")
                .select("handicap_index")
                .eq("user_id", p.user_id)
                .maybeSingle();
              const hi = playerHcp?.handicap_index ?? 0;
              const courseHandicap = calculateCourseHandicap(hi, tee.slope_rating, tee.course_rating, tee.par);

              // Build hole score array with course data
              const holeMap = new Map(courseHoles.map((h) => [h.hole_number, h]));
              const holeScoreData = playerScores
                .filter((s) => holeMap.has(s.hole_number))
                .map((s) => ({
                  strokes: s.strokes,
                  par: holeMap.get(s.hole_number)!.par,
                  handicap_index: holeMap.get(s.hole_number)!.handicap_index,
                }));

              if (holeScoreData.length > 0) {
                adjustedGrossScore = calculateAdjustedGrossScore(holeScoreData, courseHandicap);
                scoreForDifferential = adjustedGrossScore;
              }
            }

            // Handicap differentials are only valid for complete 18-hole
            // rounds. Quick Entry (no hole scores) trusts the user-typed
            // total; hole-by-hole entry requires all 18 scored.
            const playerHoleCount = (scoresByPlayer.get(p.id) || []).length;
            const eligible =
              is18 && (playerHoleCount === 0 || playerHoleCount >= 18);
            const differential = eligible
              ? calculateDifferential(
                  scoreForDifferential,
                  tee.course_rating,
                  tee.slope_rating,
                )
              : null;

            await adminClient
              .from("round_players")
              .update({
                final_adjusted_score: adjustedGrossScore,
                score_differential: differential,
              })
              .eq("id", p.id);

            playerUserIds.add(p.user_id);
          }

          // Recalculate handicap for all players in the round
          await Promise.all(
            [...playerUserIds].map((uid) => recalculateHandicap(adminClient, uid))
          );
        }
      }
    } else if (status) {
      updateData.status = status;
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await adminClient
        .from("rounds")
        .update(updateData)
        .eq("id", id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update round" }, { status: 500 });
  }
}

// DELETE - Delete a round. Any player in the round (or admin) can delete;
// the destructive ConfirmModal in the UI is the safety net (issue #130).
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
  const effectiveUserId = await getEffectiveUserId(user.id);

  const access = await canManageRound(id, effectiveUserId);
  if (!access.allowed) {
    // Treat "not found" as idempotent success so two devices racing to
    // delete don't surface a scary error to whichever loses.
    if (access.reason === "not_found") {
      return NextResponse.json({ success: true, already_deleted: true });
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("rounds")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
