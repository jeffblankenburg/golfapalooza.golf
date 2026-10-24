import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGameScore, resolveEspnEventId } from "@/lib/v2/sports/espn";

/**
 * Generalized ESPN grader (#225). One pass that auto-fills results for every
 * matchup-based contest on the generic substrate (v2_matchups) — Pick'em today,
 * straight-picks / parlays / props next — replacing the bespoke per-type graders.
 * Writes a matchup's result ONLY once ESPN marks it final (final total, overtime
 * included — never a quarter checkpoint), is idempotent (only null→result once), and
 * never clobbers a hand-entered result. Manual entry remains a fallback everywhere.
 *
 * NOTE: Squares grades a per-period grid (its own tables), a different shape — it is
 * NOT a matchup contest and keeps its own grader. The SHARED tournament substrate
 * (#226, v2_tournament_games) will reuse this pass; its finalize also advances the
 * bracket + maps ESPN home/away to the seeded competitors by espn id.
 */

/** Contest types whose games live on v2_matchups and grade to a single winner/result. */
export const MATCHUP_CONTEST_TYPES = ["pickem"] as const;

interface MatchupGradeRow {
  id: string;
  start_time: string | null;
  competitor_a: { espn_id?: string } | null;
  competitor_b: { espn_id?: string } | null;
  external_ref: { espn_event_id?: string; league?: string } | null;
}

/**
 * Auto-grade final games. Pass a `contestId` to grade one contest on demand (the admin
 * "Update scores" button); omit it to sweep every active matchup contest (the cron).
 */
export async function gradeMatchups(admin: SupabaseClient, opts: { contestId?: string } = {}): Promise<{ graded: number }> {
  let cq = admin.from("v2_contests").select("id");
  cq = opts.contestId
    ? cq.eq("id", opts.contestId)
    : cq.in("contest_type", MATCHUP_CONTEST_TYPES as unknown as string[]).eq("status", "active");
  const { data: contests } = await cq;
  const ids = (contests ?? []).map((c) => c.id as string);
  if (ids.length === 0) return { graded: 0 };

  // Ungraded (result null) games whose kickoff has arrived (15m cushion).
  const cushion = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("v2_matchups")
    .select("id, start_time, competitor_a, competitor_b, external_ref, result")
    .in("contest_id", ids)
    .is("result", null);
  const due = ((rows ?? []) as unknown as (MatchupGradeRow & { result: unknown })[])
    .filter((r) => !r.start_time || (r.start_time as string) <= cushion);
  if (due.length === 0) return { graded: 0 };

  let graded = 0;
  for (const r of due) {
    const ref = r.external_ref || {};
    const league = ref.league;
    if (!league) continue;

    let espnId = ref.espn_event_id;
    if (!espnId) {
      // Auto-match by competitor ESPN ids + date when the event wasn't linked upfront
      // (bracket games filled from results). Persist the id so later runs skip this.
      const a = r.competitor_a?.espn_id, b = r.competitor_b?.espn_id;
      if (a && b && r.start_time) {
        espnId = (await resolveEspnEventId(league, a, b, r.start_time)) ?? undefined;
        if (espnId) await admin.from("v2_matchups").update({ external_ref: { ...ref, espn_event_id: espnId } }).eq("id", r.id);
      }
    }
    if (!espnId) continue;

    const score = await fetchGameScore(league, espnId);
    if (!score || score.state !== "post") continue; // finals only
    const a = score.away?.total, h = score.home?.total; // competitor_a = away, competitor_b = home
    if (a == null || h == null) continue;
    const { error } = await admin
      .from("v2_matchups")
      .update({ result: { winner: a === h ? null : a > h ? "a" : "b", score_a: a, score_b: h }, status: "final", updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (!error) graded += 1;
  }
  return { graded };
}
