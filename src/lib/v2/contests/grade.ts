import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchGameScore, resolveEspnEventId, fetchScoreboard } from "@/lib/v2/sports/espn";
import { setGameResult } from "./tournament-server";

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
 * (#226, v2_tournament_games) reuses the same ESPN core via `gradeTournaments` below:
 * same scoreboard/final detection, but it matches by the two teams' ESPN ids (bracket
 * slots have no event id until teams advance) and finalizing advances the bracket.
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

/** A game's two ESPN team ids, order-independent, as a lookup key. */
const pairKey = (a: string, b: string) => [a, b].sort().join("~");
/** YYYYMMDD `offsetDays` from now (UTC) — the scoreboard date filter. */
function ymdUTC(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Auto-grade tournament bracket games (#226) — the same ESPN pass, one table over. Bracket
 * slots are empty until teams advance, so we can't pre-store an event id per game; instead
 * we sweep the league's recent finals from the scoreboard and match each to a ready game by
 * its two teams' ESPN ids. A match calls `setGameResult`, which records the score AND
 * advances the winner (First Four → R1 and upward), so a finished game cascades for free.
 * Idempotent (only games with a null result are considered) and never touches a hand-set
 * result. Later-round games fill in over subsequent runs as their feeders finalize.
 *
 * Pass `tournamentId` to grade one bracket on demand; omit it to sweep every in-progress
 * tournament (the cron).
 */
export async function gradeTournaments(admin: SupabaseClient, opts: { tournamentId?: string } = {}): Promise<{ graded: number }> {
  let tq = admin.from("v2_tournaments").select("id, sport");
  tq = opts.tournamentId ? tq.eq("id", opts.tournamentId) : tq.in("status", ["locked", "live"]);
  const { data: tourneys } = await tq;
  const list = (tourneys ?? []) as { id: string; sport: string }[];
  if (list.length === 0) return { graded: 0 };

  // Collect recent finals per league once (today + yesterday covers day boundaries / a
  // missed run), keyed by the two teams' ESPN ids.
  const dates = [ymdUTC(0), ymdUTC(-1)];
  const finalsByLeague = new Map<string, Map<string, { winnerEspnId: string; scoreByEspn: Map<string, number> }>>();
  for (const league of new Set(list.map((t) => t.sport))) {
    const byPair = new Map<string, { winnerEspnId: string; scoreByEspn: Map<string, number> }>();
    for (const date of dates) {
      let games;
      try { games = await fetchScoreboard(league, date); } catch { continue; }
      for (const g of games) {
        if (g.state !== "post" || !g.home || !g.away) continue;
        const hs = g.home.score, as = g.away.score;
        if (hs == null || as == null || hs === as) continue; // finals with a winner only
        byPair.set(pairKey(g.home.espnId, g.away.espnId), {
          winnerEspnId: hs > as ? g.home.espnId : g.away.espnId,
          scoreByEspn: new Map([[g.home.espnId, hs], [g.away.espnId, as]]),
        });
      }
    }
    finalsByLeague.set(league, byPair);
  }

  let graded = 0;
  for (const t of list) {
    const finals = finalsByLeague.get(t.sport);
    if (!finals || finals.size === 0) continue;
    const [{ data: teamRows }, { data: gameRows }] = await Promise.all([
      admin.from("v2_tournament_teams").select("id, espn_id").eq("tournament_id", t.id),
      admin.from("v2_tournament_games").select("id, team_a_id, team_b_id").eq("tournament_id", t.id).is("result", null),
    ]);
    const espnByTeam = new Map((teamRows ?? []).map((r) => [r.id as string, (r.espn_id as string | null) ?? null]));
    for (const g of gameRows ?? []) {
      const aId = g.team_a_id as string | null, bId = g.team_b_id as string | null;
      if (!aId || !bId) continue; // both teams must be known
      const aEspn = espnByTeam.get(aId), bEspn = espnByTeam.get(bId);
      if (!aEspn || !bEspn) continue; // manual team with no ESPN id — not auto-gradable
      const fin = finals.get(pairKey(aEspn, bEspn));
      if (!fin) continue;
      const winnerTeamId = fin.winnerEspnId === aEspn ? aId : fin.winnerEspnId === bEspn ? bId : null;
      if (!winnerTeamId) continue;
      try {
        await setGameResult(admin, t.id, g.id as string, {
          winnerTeamId, scoreA: fin.scoreByEspn.get(aEspn) ?? null, scoreB: fin.scoreByEspn.get(bEspn) ?? null,
        });
        graded += 1;
      } catch { /* a race (game already advanced) — next run reconciles */ }
    }
  }
  return { graded };
}
