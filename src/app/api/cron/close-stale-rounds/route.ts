import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalcAffectedPlayers } from "@/lib/golf/recalc";

/**
 * Cron endpoint: runs nightly at ~2am ET (0 6 * * * UTC; Vercel crons are UTC
 * and don't observe DST, so this is 2am EDT / 1am EST).
 *
 * A round is only ever moved in_progress -> completed by an explicit user tap.
 * A Loozer who gets rained out and just walks away leaves the round stuck in
 * `in_progress` forever — haunting the Live "Now" feed and never resolving.
 *
 * A round still `in_progress` more than 24 hours after it started
 * (`started_at`) was abandoned — golf is a same-day activity, nobody is a full
 * day into a round. We key off an absolute 24h cutoff rather than a calendar
 * date so timezones/DST never make the boundary weird. We resolve it:
 *   - If ANY hole was scored -> complete it. recalcAffectedPlayers recomputes
 *     gross/adjusted/differential exactly like a manual completion, so it lands
 *     as a labeled "Incomplete" round (partial => differential null, excluded
 *     from stats/handicap). A full-18 round that was simply never tapped
 *     complete gets its real differential and counts, same as manual.
 *   - If NO holes were scored -> delete it (nothing worth keeping). round_players
 *     and round_scores cascade-delete off the rounds row.
 *
 * What protects an active round is the 24h cutoff, NOT the cron's clock time:
 * nothing younger than a day is ever eligible, so the job can never touch a
 * round someone is currently playing — including one that crossed midnight.
 * Because it runs once nightly, an abandoned round clears within ~24–48h of
 * starting (whenever the next 2am run finds it past the cutoff).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Absolute 24h cutoff — an instant, so timezones/DST never skew the boundary.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: staleRounds, error } = await supabase
    .from("rounds")
    .select("id, round_type, format")
    .eq("status", "in_progress")
    .lt("started_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!staleRounds || staleRounds.length === 0) {
    return NextResponse.json({ checked: 0, completed: 0, deleted: 0 });
  }

  const roundIds = staleRounds.map((r) => r.id);

  // Roster + score presence for every stale round, in two batched reads.
  const [{ data: playerRows }, { data: scoreRows }] = await Promise.all([
    supabase.from("round_players").select("id, round_id").in("round_id", roundIds),
    supabase.from("round_scores").select("round_id").in("round_id", roundIds),
  ]);

  const playerIdsByRound = new Map<string, string[]>();
  for (const p of playerRows || []) {
    const arr = playerIdsByRound.get(p.round_id) || [];
    arr.push(p.id);
    playerIdsByRound.set(p.round_id, arr);
  }
  const scoredRoundIds = new Set((scoreRows || []).map((s) => s.round_id));

  const toDelete = staleRounds.filter((r) => !scoredRoundIds.has(r.id)).map((r) => r.id);
  const toComplete = staleRounds.filter((r) => scoredRoundIds.has(r.id));

  // Empty rounds: drop them. Cascade removes round_players/round_scores.
  if (toDelete.length > 0) {
    await supabase.from("rounds").delete().in("id", toDelete);
  }

  // Scored rounds: flip to completed, then recompute exactly like a manual
  // completion so gross/differential/handicap all land correctly.
  if (toComplete.length > 0) {
    const completedAt = new Date().toISOString();
    await supabase
      .from("rounds")
      .update({ status: "completed", completed_at: completedAt })
      .in("id", toComplete.map((r) => r.id));

    for (const r of toComplete) {
      const playerIds = playerIdsByRound.get(r.id) || [];
      if (playerIds.length === 0) continue;
      await recalcAffectedPlayers(supabase, r.id, r.round_type, playerIds, r.format);
    }
  }

  return NextResponse.json({
    checked: staleRounds.length,
    completed: toComplete.length,
    deleted: toDelete.length,
  });
}
