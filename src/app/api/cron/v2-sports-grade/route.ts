import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { gradeMatchups, gradeTournaments } from "@/lib/v2/contests/grade";

/**
 * @swagger
 * /api/cron/v2-sports-grade:
 *   get:
 *     summary: Auto-grade final games from ESPN across every matchup-based contest
 *     tags: [Cron]
 *     description: |
 *       Bearer-authed, runs every minute but DATA-GATED: only touches ESPN-linked
 *       games in active matchup contests (Pick'em and future pick-and-grade types) that
 *       aren't scored yet and whose kickoff has passed. Writes a game only once ESPN
 *       marks it FINAL, using the final total (overtime included) — never a quarter
 *       checkpoint — and never overwrites a score entered by hand. Grading + standings
 *       update automatically. Replaces the Pick'em-specific grader (#225). Also sweeps
 *       tournament brackets (#226): recent finals are matched to ready bracket games by
 *       the two teams' ESPN ids, advancing the bracket (and the auction's scoring).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = v2AdminClient();
  const [matchups, tournaments] = await Promise.all([gradeMatchups(admin), gradeTournaments(admin)]);
  return NextResponse.json({ graded: matchups.graded + tournaments.graded, matchups: matchups.graded, tournaments: tournaments.graded });
}
