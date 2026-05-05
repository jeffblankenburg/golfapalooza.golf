import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";
import RoundCard from "@/components/my-rounds/RoundCard";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { formatCourseName } from "@/lib/utils/course-display";
import { BTN_PRIMARY } from "@/lib/ui/buttons";

export default async function MyRoundsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const effectiveUserId = await getEffectiveUserId(user.id);

  const [{ data: rounds }, { data: handicapRow }] = await Promise.all([
    supabase
      .from("rounds")
      .select(`
        id,
        round_date,
        round_type,
        status,
        course:courses(id, name, club_name, city, state),
        tee:course_tees(id, tee_name, tee_color, par),
        round_players!inner(
          user_id,
          tee_id,
          final_gross_score,
          score_differential,
          player_tee:course_tees(id, tee_name, tee_color, par)
        )
      `)
      .eq("round_players.user_id", effectiveUserId)
      .order("round_date", { ascending: false }),
    supabase
      .from("player_handicaps")
      .select("handicap_index")
      .eq("user_id", effectiveUserId)
      .maybeSingle(),
  ]);

  const handicapIndex = handicapRow?.handicap_index ?? null;

  const roundSummaries = (rounds || []).map((r) => {
    const allPlayers = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = allPlayers.find((p) => p.user_id === effectiveUserId) || allPlayers[0];
    const roundTee = Array.isArray(r.tee) ? r.tee[0] : r.tee;
    // Prefer the player's personal tee (may be a composition tee override)
    const playerTee = player?.player_tee ? (Array.isArray(player.player_tee) ? player.player_tee[0] : player.player_tee) : null;
    const tee = playerTee || roundTee;
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const par = tee?.par || 72;
    const score = player?.final_gross_score;

    return {
      id: r.id,
      round_date: r.round_date,
      round_type: r.round_type,
      status: r.status,
      course_name: course ? formatCourseName(course) : "Unknown",
      course_city: course?.city,
      course_state: course?.state,
      tee_name: tee?.tee_name || "",
      tee_color: tee?.tee_color,
      par,
      final_score: score,
      score_to_par: score != null ? score - par : null,
      score_differential: player?.score_differential,
    };
  });

  const completedRounds = roundSummaries.filter((r) => r.final_score != null);
  const avgScore = completedRounds.length > 0
    ? Math.round(completedRounds.reduce((sum, r) => sum + (r.final_score || 0), 0) / completedRounds.length)
    : null;
  const bestScore = completedRounds.length > 0
    ? Math.min(...completedRounds.map((r) => r.final_score || 999))
    : null;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">My Rounds</h1>
          <PinnedNoteButton pinnedTo="my_rounds" />
        </div>
        <Link
          href="/my-rounds/rounds/new"
          className="w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center hover:bg-green-700 transition-colors shadow-sm shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14m-7-7h14" />
          </svg>
        </Link>
      </div>

      {completedRounds.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-5">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <div className="text-xs text-blue-700">HCP</div>
            <div className="text-lg font-bold text-blue-700">
              {handicapIndex != null ? handicapIndex.toFixed(1) : "—"}
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">Rounds</div>
            <div className="text-lg font-bold text-gray-900">{completedRounds.length}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">Average</div>
            <div className="text-lg font-bold text-gray-900">{avgScore ?? "—"}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
            <div className="text-xs text-gray-500">Best</div>
            <div className="text-lg font-bold text-green-600">{bestScore ?? "—"}</div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {roundSummaries.map((round) => (
          <RoundCard key={round.id} {...round} />
        ))}

        {roundSummaries.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-3">No rounds logged yet</p>
            <Link href="/my-rounds/rounds/new" className={BTN_PRIMARY}>
              Log your first round →
            </Link>
          </div>
        )}
      </div>

      <Link
        href="/my-rounds/courses"
        className="mt-5 w-full inline-flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-gray-200 active:bg-gray-50 transition-colors shadow-sm"
      >
        <span className="text-sm font-medium text-gray-900">View all courses</span>
        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}
