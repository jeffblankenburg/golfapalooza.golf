import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";

/**
 * @swagger
 * /api/cron/v2-close-stale-rounds:
 *   get:
 *     summary: Auto-set-aside abandoned v2 rounds (non-destructive)
 *     tags: [Cron]
 *     description: |
 *       Bearer-authed, runs daily. A v2 round left `in_progress` with no scoring
 *       activity for 48h was walked away from (golf is a same-day activity). We
 *       set it aside: flip status `in_progress` -> `abandoned` and delete its LIVE
 *       activity-feed entry so it stops haunting the home feed and "other groups."
 *
 *       This is NON-DESTRUCTIVE and distinct from the v1 `close-stale-rounds` cron
 *       (which force-completes or deletes). An abandoned round keeps every score,
 *       player, and side game, shows under "Unfinished" in My Rounds, and can be
 *       resumed (POST /api/v2/rounds/[id]/resume) to keep playing, or deleted.
 *       Nothing counts toward stats/handicap until it's actually completed.
 *
 *       "Inactivity" is measured from the LAST hole scored (newest
 *       `v2_round_scores` timestamp), falling back to `started_at` for a round
 *       that was set up but never scored (empties are set aside too, so the roster
 *       + course are preserved for a resume). A round touched within 48h is never
 *       eligible, so the job can't yank one out from under an active (even very
 *       slow, midnight-crossing) group.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();

  // Absolute 48h cutoff — an instant, so timezones/DST never skew the boundary.
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Candidates: only a round that STARTED before the cutoff can possibly be idle
  // past it (last activity is always >= started_at). Narrows the set up front.
  const { data: candidates, error } = await admin
    .from("v2_rounds")
    .select("id")
    .eq("status", "in_progress")
    .lt("started_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ checked: 0, archived: 0 });
  }

  const candidateIds = candidates.map((r) => r.id);

  // Most-recent scoring touch per candidate. A round with ANY score updated at or
  // after the cutoff is still active (someone's playing/resuming) — keep it. A
  // round with no scores at all has nothing after the cutoff, so it's eligible
  // (its started_at already cleared the cutoff via the candidate filter).
  const { data: scoreRows } = await admin
    .from("v2_round_scores")
    .select("round_id, created_at, updated_at")
    .in("round_id", candidateIds);

  const activeRoundIds = new Set<string>();
  for (const s of scoreRows || []) {
    const touched = s.updated_at && s.created_at ? (s.updated_at > s.created_at ? s.updated_at : s.created_at) : s.updated_at || s.created_at;
    if (touched && touched >= cutoff) activeRoundIds.add(s.round_id);
  }

  const staleIds = candidateIds.filter((id) => !activeRoundIds.has(id));
  if (staleIds.length === 0) {
    return NextResponse.json({ checked: candidateIds.length, archived: 0 });
  }

  // Set them aside. No recalc (in-progress rounds have no final scores/diffs), no
  // delete (scores/roster/side-games are preserved for a later resume).
  const { error: updErr } = await admin
    .from("v2_rounds")
    .update({ status: "abandoned" })
    .in("id", staleIds);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Pull the LIVE entry out of the group activity feed (silent rounds have none;
  // this is then a no-op for them).
  await admin.from("v2_activity").delete().in("ref_id", staleIds).eq("kind", "round");

  return NextResponse.json({ checked: candidateIds.length, archived: staleIds.length });
}
