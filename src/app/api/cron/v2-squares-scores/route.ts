import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { getLeague, fetchGameScore, periodScoresFromGame } from "@/lib/v2/sports/espn";

/**
 * @swagger
 * /api/cron/v2-squares-scores:
 *   get:
 *     summary: Poll ESPN for live Squares games and cache scores
 *     tags: [Cron]
 *     description: |
 *       Bearer-authed. Runs every minute but is DATA-GATED: it first finds Squares
 *       pools whose phase is "locked" (numbers drawn) and only then looks at their
 *       games. A game is polled only when its numbers are set, it isn't final yet,
 *       and its ESPN kickoff has arrived (start_time <= now + 15m; NULL kickoff =
 *       always eligible). When no game qualifies the tick costs one indexed query
 *       and no ESPN calls. For each live game it caches the current running score
 *       (live_score, drives the home-page winning-square highlight) and the
 *       period-end snapshots (period_scores, drives the payout sheet), and flips
 *       status to in_progress / final.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();

  // 1) Locked Squares pools only (numbers drawn → a winning square exists).
  const { data: pools } = await admin
    .from("v2_contests")
    .select("id")
    .eq("contest_type", "squares")
    .eq("config->>phase", "locked");
  const poolIds = (pools ?? []).map((p) => p.id);
  if (poolIds.length === 0) return NextResponse.json({ pools: 0, polled: 0, finalized: 0 });

  // 2) Games worth polling: numbers set, not final, kickoff reached.
  const cushion = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: games } = await admin
    .from("v2_squares_games")
    .select("id, league, espn_event_id, start_time")
    .in("contest_id", poolIds)
    .neq("status", "final")
    .not("locked_at", "is", null)
    .not("espn_event_id", "is", null)
    .or(`start_time.is.null,start_time.lte.${cushion}`);
  if (!games || games.length === 0) return NextResponse.json({ pools: poolIds.length, polled: 0, finalized: 0 });

  // 3) Fetch each game's score in parallel, then write the cached values.
  const scored = await Promise.all(
    games.map(async (g) => {
      const structure = getLeague(g.league as string)?.periods;
      if (structure !== "quarters" && structure !== "halves") return null;
      const score = await fetchGameScore(g.league as string, g.espn_event_id as string);
      if (!score) return null;
      return { id: g.id as string, structure, score };
    }),
  );

  const now = new Date().toISOString();
  let polled = 0;
  let finalized = 0;
  await Promise.all(
    scored.map(async (s) => {
      if (!s) return;
      const status = s.score.state === "post" ? "final" : s.score.state === "in" ? "in_progress" : "scheduled";
      const live = {
        away: s.score.away?.current ?? null,
        home: s.score.home?.current ?? null,
        state: s.score.state,
        detail: s.score.detail,
      };
      const { error } = await admin
        .from("v2_squares_games")
        .update({ period_scores: periodScoresFromGame(s.score, s.structure), live_score: live, status, updated_at: now })
        .eq("id", s.id);
      if (!error) {
        polled += 1;
        if (status === "final") finalized += 1;
      }
    }),
  );

  return NextResponse.json({ pools: poolIds.length, polled, finalized });
}
