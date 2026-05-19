import {
  calculateAdjustedGrossScore,
  calculateCourseHandicap,
  calculateDifferential,
} from "@/lib/golf/calculator";
import { recalculateHandicap } from "@/lib/golf/handicap";

/**
 * For each affected round_player on a completed round, recompute
 * final_gross_score, final_adjusted_score, and score_differential from the
 * current state of round_scores + round_players.tee_id, then trigger a
 * handicap recalculation for each affected user.
 *
 * Used by both POST /api/rounds/[id]/scores (post-completion score edits)
 * and PUT  /api/rounds/[id]/edit (bulk date/tee/score edits).
 *
 * Caller is responsible for the permission check and the edited_at stamp.
 */
export async function recalcAffectedPlayers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  roundId: string,
  roundType: string,
  affectedPlayerIds: string[],
): Promise<void> {
  if (affectedPlayerIds.length === 0) return;

  const is18 = (roundType ?? "18") === "18";

  // Pull latest tee_id + gross totals from round_scores.
  const { data: players } = await supabase
    .from("round_players")
    .select("id, user_id, tee_id")
    .in("id", affectedPlayerIds);

  if (!players || players.length === 0) return;

  // Recompute gross from current round_scores rows.
  const { data: allScores } = await supabase
    .from("round_scores")
    .select("round_player_id, hole_number, strokes")
    .eq("round_id", roundId);

  const scoresByPlayer = new Map<string, { hole_number: number; strokes: number }[]>();
  for (const s of (allScores || []) as { round_player_id: string; hole_number: number; strokes: number }[]) {
    const arr = scoresByPlayer.get(s.round_player_id) || [];
    arr.push({ hole_number: s.hole_number, strokes: s.strokes });
    scoresByPlayer.set(s.round_player_id, arr);
  }

  const grossByPlayer = new Map<string, number | null>();
  for (const p of players as { id: string }[]) {
    const arr = scoresByPlayer.get(p.id);
    grossByPlayer.set(p.id, arr && arr.length > 0 ? arr.reduce((sum, s) => sum + s.strokes, 0) : null);
  }

  const teeIds = [...new Set((players as { tee_id: string }[]).map((p) => p.tee_id).filter(Boolean))];
  const { data: teesData } = await supabase
    .from("course_tees")
    .select("id, course_rating, slope_rating, par")
    .in("id", teeIds);
  const teeMap = new Map(
    (teesData || []).map((t: { id: string; course_rating: number; slope_rating: number; par: number }) => [t.id, t]),
  );

  // Hole data for adjusted-gross calc.
  const holeDataMap = new Map<string, { hole_number: number; par: number; handicap_index: number }[]>();
  if (teeIds.length > 0) {
    const { data: holes } = await supabase
      .from("course_holes")
      .select("tee_id, hole_number, par, handicap_index")
      .in("tee_id", teeIds);
    for (const h of (holes || []) as { tee_id: string; hole_number: number; par: number; handicap_index: number }[]) {
      const arr = holeDataMap.get(h.tee_id) || [];
      arr.push({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index });
      holeDataMap.set(h.tee_id, arr);
    }
  }

  const playerUserIds = new Set<string>();

  for (const p of players as { id: string; user_id: string; tee_id: string }[]) {
    const gross = grossByPlayer.get(p.id) ?? null;
    const tee = teeMap.get(p.tee_id) as { id: string; course_rating: number; slope_rating: number; par: number } | undefined;

    if (gross == null || !tee) {
      await supabase
        .from("round_players")
        .update({ final_gross_score: gross, final_adjusted_score: null, score_differential: null })
        .eq("id", p.id);
      playerUserIds.add(p.user_id);
      continue;
    }

    let scoreForDifferential = gross;
    let adjustedGrossScore: number | null = null;

    const playerScores = scoresByPlayer.get(p.id);
    const courseHoles = holeDataMap.get(p.tee_id);
    if (playerScores && courseHoles && playerScores.length >= 9) {
      const { data: playerHcp } = await supabase
        .from("player_handicaps")
        .select("handicap_index")
        .eq("user_id", p.user_id)
        .maybeSingle();
      const hi = (playerHcp as { handicap_index: number } | null)?.handicap_index ?? 0;
      const courseHandicap = calculateCourseHandicap(hi, tee.slope_rating, tee.course_rating, tee.par);

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

    const playerHoleCount = (scoresByPlayer.get(p.id) || []).length;
    const eligible = is18 && (playerHoleCount === 0 || playerHoleCount >= 18);
    const differential = eligible
      ? calculateDifferential(scoreForDifferential, tee.course_rating, tee.slope_rating)
      : null;

    await supabase
      .from("round_players")
      .update({
        final_gross_score: gross,
        final_adjusted_score: adjustedGrossScore,
        score_differential: differential,
      })
      .eq("id", p.id);

    playerUserIds.add(p.user_id);
  }

  await Promise.all([...playerUserIds].map((uid) => recalculateHandicap(supabase, uid)));
}
