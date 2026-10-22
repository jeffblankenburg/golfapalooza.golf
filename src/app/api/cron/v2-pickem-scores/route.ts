import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { gradePickemFinals } from "@/lib/v2/contests/pickem-server";

/**
 * @swagger
 * /api/cron/v2-pickem-scores:
 *   get:
 *     summary: Auto-grade final Pick'em games from ESPN
 *     tags: [Cron]
 *     description: |
 *       Bearer-authed, runs every minute but DATA-GATED: it only touches ESPN-linked
 *       games in active Pick'em contests that aren't scored yet and whose kickoff has
 *       passed. Writes a game only once ESPN marks it FINAL, using the final total
 *       (overtime included) — never a quarter/half checkpoint — and never overwrites a
 *       score already entered by hand. Grading + the leaderboard update automatically.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { graded } = await gradePickemFinals(v2AdminClient());
  return NextResponse.json({ graded });
}
