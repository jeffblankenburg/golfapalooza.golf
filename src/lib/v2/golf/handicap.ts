import { SupabaseClient } from "@supabase/supabase-js";
import { calculateHandicapIndex, type RoundDifferential } from "@/lib/v2/golf/calculator";

/**
 * Recalculate a golfer's USGA Handicap Index from their most recent 20 completed
 * 18-hole individual rounds, and upsert v2_player_handicaps. Ported from the
 * legacy pipeline (src/lib/golf/handicap.ts) with v2 table names. Personal &
 * global: rounds are gathered by user_id across every group.
 *
 * (v2 omits the legacy handicap_history audit table for now.)
 */
export async function recalculateHandicap(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  // 9-hole rounds aren't WHS-eligible against an 18-hole rating/slope, and
  // scrambles carry no differential — both are excluded here (and at write time).
  const { data: rounds } = await supabase
    .from("v2_round_players")
    .select(`
      round_id,
      score_differential,
      final_adjusted_score,
      final_gross_score,
      tee:v2_course_tees!v2_round_players_tee_id_fkey(course_rating, slope_rating),
      round:v2_rounds!inner(round_date, status, round_type, format, course:v2_courses(name))
    `)
    .eq("user_id", userId)
    .eq("round.status", "completed")
    .eq("round.round_type", "18")
    .eq("round.format", "individual")
    .not("score_differential", "is", null)
    .order("round(round_date)", { ascending: false })
    .limit(20);

  if (!rounds || rounds.length < 3) return;

  const differentials: RoundDifferential[] = rounds.map((r) => {
    const round = Array.isArray(r.round) ? r.round[0] : r.round;
    const tee = Array.isArray(r.tee) ? r.tee[0] : r.tee;
    const course = (round as Record<string, unknown>)?.course;
    const courseName = Array.isArray(course)
      ? (course[0] as { name: string })?.name
      : (course as { name: string })?.name;

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

  const { data: existing } = await supabase
    .from("v2_player_handicaps")
    .select("low_handicap_index")
    .eq("user_id", userId)
    .maybeSingle();

  const currentLowHI = existing?.low_handicap_index ?? null;

  const result = calculateHandicapIndex(differentials, currentLowHI);
  if (!result) return;

  const today = new Date().toISOString().split("T")[0];

  await supabase.from("v2_player_handicaps").upsert(
    {
      user_id: userId,
      handicap_index: result.handicap_index,
      low_handicap_index: result.low_handicap_index,
      rounds_used: result.rounds_used,
      last_calculated_at: new Date().toISOString(),
      effective_date: today,
    },
    { onConflict: "user_id" },
  );
}
