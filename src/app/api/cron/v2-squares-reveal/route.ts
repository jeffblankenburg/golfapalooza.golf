import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";
import { v2AdminClient } from "@/lib/v2/supabase";

/** Fair server-side shuffle of 0-9 (crypto RNG — never admin-controlled). */
function drawDigits(): number[] {
  const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @swagger
 * /api/cron/v2-squares-reveal:
 *   get:
 *     summary: Auto-reveal scheduled Squares game numbers
 *     tags: [Cron]
 *     description: |
 *       Bearer-authed, every minute, DATA-GATED: finds locked Squares pools, then
 *       any of their games whose numbers aren't revealed yet (locked_at NULL) and
 *       whose reveal_at has arrived. Rolls each such game's digits one-shot and
 *       stamps locked_at. When nothing is due the tick costs one indexed query.
 *       Manual "Reveal now" and this cron share the same irreversible draw.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();

  // Locked pools only (board frozen → reveals in progress).
  const { data: pools } = await admin.from("v2_contests").select("id").eq("contest_type", "squares").eq("config->>phase", "locked");
  const poolIds = (pools ?? []).map((p) => p.id);
  if (poolIds.length === 0) return NextResponse.json({ pools: 0, revealed: 0 });

  const now = new Date().toISOString();
  const { data: due } = await admin
    .from("v2_squares_games")
    .select("id")
    .in("contest_id", poolIds)
    .is("locked_at", null)
    .not("reveal_at", "is", null)
    .lte("reveal_at", now);
  if (!due || due.length === 0) return NextResponse.json({ pools: poolIds.length, revealed: 0 });

  let revealed = 0;
  for (const g of due) {
    const { error } = await admin
      .from("v2_squares_games")
      .update({ row_digits: drawDigits(), col_digits: drawDigits(), locked_at: now })
      .eq("id", g.id)
      .is("locked_at", null); // guard against a concurrent manual reveal
    if (!error) revealed += 1;
  }

  return NextResponse.json({ pools: poolIds.length, revealed });
}
