import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { revealLeadMinutesOf } from "@/lib/v2/contests/squares-server";

/**
 * @swagger
 * /api/cron/v2-squares-advance:
 *   get:
 *     summary: Auto-advance Squares draft phases on their scheduled dates
 *     tags: [Cron]
 *     description: |
 *       Bearer-authed, every minute, DATA-GATED. Runs the admin's chosen draft
 *       schedule hands-off:
 *         - a pool in the PRIMARY draft whose `primary_ends_at` has passed →
 *           opens the SECONDARY draft.
 *         - a pool in the SECONDARY draft whose `secondary_ends_at` has passed →
 *           LOCKS the board (freezes ownership) and seeds each game's reveal time
 *           (kickoff − the pool's reveal lead). The v2-squares-reveal cron then
 *           draws the numbers on schedule.
 *       Dates left blank are never advanced — that pool stays manual. Pools still
 *       in `setup` (hidden) are untouched; only live drafts advance.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const past = (iso: unknown): boolean => typeof iso === "string" && !!iso && Date.parse(iso) <= nowMs;

  // PRIMARY → SECONDARY: the primary draft's end time has arrived.
  const { data: primaryPools } = await admin
    .from("v2_contests")
    .select("id, config")
    .eq("contest_type", "squares")
    .eq("config->>phase", "primary");
  let opened = 0;
  for (const p of primaryPools ?? []) {
    const cfg = { ...((p.config as Record<string, unknown>) ?? {}) };
    if (!past(cfg.primary_ends_at)) continue;
    cfg.phase = "secondary";
    const { error } = await admin
      .from("v2_contests")
      .update({ config: cfg })
      .eq("id", p.id)
      .eq("config->>phase", "primary"); // guard against a concurrent manual move
    if (!error) opened += 1;
  }

  // SECONDARY → LOCKED: the secondary draft's end time has arrived. Freeze the
  // board and seed each game's reveal time (reuses the manual lock_board logic).
  const { data: secondaryPools } = await admin
    .from("v2_contests")
    .select("id, config")
    .eq("contest_type", "squares")
    .eq("config->>phase", "secondary");
  let locked = 0;
  for (const p of secondaryPools ?? []) {
    const cfg = { ...((p.config as Record<string, unknown>) ?? {}) };
    if (!past(cfg.secondary_ends_at)) continue;

    const leadMinutes = revealLeadMinutesOf(cfg);
    const { data: games } = await admin
      .from("v2_squares_games")
      .select("id, start_time, reveal_at, locked_at")
      .eq("contest_id", p.id);
    for (const g of games ?? []) {
      if (g.reveal_at || g.locked_at || !g.start_time) continue;
      const revealAt = new Date(new Date(g.start_time as string).getTime() - leadMinutes * 60000).toISOString();
      await admin.from("v2_squares_games").update({ reveal_at: revealAt }).eq("id", g.id);
    }
    cfg.phase = "locked";
    cfg.board_locked_at = nowIso;
    cfg.board_locked_by = null; // system (cron), not an admin
    const { error } = await admin
      .from("v2_contests")
      .update({ config: cfg })
      .eq("id", p.id)
      .eq("config->>phase", "secondary"); // guard against a concurrent manual move
    if (!error) locked += 1;
  }

  return NextResponse.json({ opened, locked });
}
