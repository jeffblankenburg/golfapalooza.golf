import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { recalcAffectedPlayers } from "@/lib/v2/golf/recalc";
import { formatCourseName } from "@/lib/v2/course-display";
import { orgSlug, clearRoundActivity, logRoundScores } from "@/lib/v2/rounds/round-activity";

/**
 * POST — finalize an in-progress round: flip status → completed, stamp
 * completed_at, and compute each player's gross / adjusted / differential and
 * recalc their handicap (via the shared pipeline). Co-equal ownership: any
 * player on the round (or its creator) may complete it. Idempotent-ish — running
 * it on an already-completed round just recomputes.
 *
 * Activity feed: the round's LIVE entry is removed and replaced with per-Loozer
 * score entries (or a single team entry for a scramble).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: roundId } = await params;

  const admin = v2AdminClient();
  const { data: round } = await admin
    .from("v2_rounds")
    .select("id, status, created_by, round_type, format, org_id, tee_id, course:v2_courses(name, club_name)")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const { data: roster } = await admin
    .from("v2_round_players")
    .select("id, user_id")
    .eq("round_id", roundId);
  const isPlayer = (roster || []).some((r) => r.user_id === userId);
  if (round.created_by !== userId && !isPlayer) {
    return NextResponse.json({ error: "Only players in this round can complete it" }, { status: 403 });
  }

  const playerIds = (roster || []).map((r) => r.id);

  const { error: statusErr } = await admin
    .from("v2_rounds")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", roundId);
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 });

  await recalcAffectedPlayers(admin, roundId, round.round_type ?? "18", playerIds, round.format);

  // Activity feed: swap the live entry for per-player score entries.
  if (round.org_id) {
    const slug = await orgSlug(admin, round.org_id);
    if (slug) {
      const course = Array.isArray(round.course) ? round.course[0] : round.course;
      const courseName = course ? formatCourseName(course) : "a round";
      const is18 = (round.round_type ?? "18") === "18";
      const isScramble = round.format === "scramble";

      // Par (for to-par) from the round tee; halved for a 9-hole round.
      const { data: tee } = round.tee_id
        ? await admin.from("v2_course_tees").select("par").eq("id", round.tee_id).maybeSingle()
        : { data: null };
      const par = (() => {
        const tp = (tee?.par as number | undefined) ?? 72;
        return is18 ? tp : Math.round(tp / 2);
      })();

      // Final grosses after recalc.
      const { data: finals } = await admin
        .from("v2_round_players")
        .select("user_id, final_gross_score")
        .eq("round_id", roundId);
      const toPar = (g: number | null) => (g != null ? g - par : null);
      const entries = isScramble
        ? [{ actorId: round.created_by, score: finals?.[0]?.final_gross_score ?? null, toPar: toPar(finals?.[0]?.final_gross_score ?? null) }]
        : (finals || [])
            .filter((r) => r.user_id)
            .map((r) => ({ actorId: r.user_id as string, score: r.final_gross_score, toPar: toPar(r.final_gross_score) }));

      await clearRoundActivity(admin, roundId);
      await logRoundScores(admin, { orgId: round.org_id, slug, roundId, courseName, entries });
    }
  }

  return NextResponse.json({ success: true });
}
