import { SupabaseClient } from "@supabase/supabase-js";
import { calculateHandicapIndex } from "@/lib/golf/calculator";
import type { RoundDifferential } from "@/types/golf";

/**
 * Recalculate a player's USGA Handicap Index from their most recent 20 completed rounds.
 * Updates player_handicaps and logs to handicap_history.
 */
export async function recalculateHandicap(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  // Fetch the 20 most recent completed 18-hole round differentials. 9-hole
  // rounds aren't WHS-eligible against an 18-hole rating/slope and would
  // distort the index until we store proper 9-hole rating/slope.
  const { data: rounds } = await supabase
    .from("round_players")
    .select(`
      round_id,
      score_differential,
      final_adjusted_score,
      final_gross_score,
      tee:course_tees!round_players_tee_id_fkey(course_rating, slope_rating),
      round:rounds!inner(round_date, status, round_type, course:courses(name))
    `)
    .eq("user_id", userId)
    .eq("round.status", "completed")
    .eq("round.round_type", "18")
    .not("score_differential", "is", null)
    .order("round(round_date)", { ascending: false })
    .limit(20);

  if (!rounds || rounds.length < 3) return;

  const differentials: RoundDifferential[] = rounds.map((r) => {
    const round = Array.isArray(r.round) ? r.round[0] : r.round;
    const tee = Array.isArray(r.tee) ? r.tee[0] : r.tee;
    const course = (round as Record<string, unknown>)?.course;
    const courseName = Array.isArray(course) ? (course[0] as { name: string })?.name : (course as { name: string })?.name;

    return {
      round_id: r.round_id,
      round_date: round?.round_date || "",
      course_name: courseName || "Unknown",
      adjusted_gross_score: r.final_adjusted_score ?? r.final_gross_score ?? 0,
      course_rating: tee?.course_rating ?? 0,
      slope_rating: tee?.slope_rating ?? 113,
      differential: r.score_differential!,
    };
  });

  // Fetch current low handicap index
  const { data: existing } = await supabase
    .from("player_handicaps")
    .select("low_handicap_index")
    .eq("user_id", userId)
    .maybeSingle();

  const currentLowHI = existing?.low_handicap_index ?? null;

  const result = calculateHandicapIndex(differentials, currentLowHI);
  if (!result) return;

  const today = new Date().toISOString().split("T")[0];

  // Upsert player_handicaps
  await supabase
    .from("player_handicaps")
    .upsert(
      {
        user_id: userId,
        handicap_index: result.handicap_index,
        low_handicap_index: result.low_handicap_index,
        rounds_used: result.rounds_used,
        last_calculated_at: new Date().toISOString(),
        effective_date: today,
        source: "computed",
      },
      { onConflict: "user_id" }
    );

  // Log to handicap_history
  await supabase.from("handicap_history").insert({
    user_id: userId,
    handicap_index: result.handicap_index,
    rounds_used: result.rounds_used,
    differentials_used: result.differentials.map((d) => d.differential),
    calculation_method: result.calculation_method,
    effective_date: today,
  });
}
