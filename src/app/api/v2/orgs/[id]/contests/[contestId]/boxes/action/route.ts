import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

type Params = Promise<{ id: string; contestId: string }>;

/** Server-side fair shuffle of 0-9 (crypto RNG — the admin never touches it). */
function drawDigits(): number[] {
  const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Phase transitions a plain advance can make. `draw` and `finalize` are handled
// separately (they touch games / status too).
const PHASE_MOVES: Record<string, string> = {
  open_primary: "primary",
  open_secondary: "secondary",
  close_picks: "closed",
  reopen_secondary: "secondary", // admin re-opens buying before the draw
};

/**
 * Boxes lifecycle (#230). Admin advances the draft phases and triggers the
 * one-shot number draw. The draw is server-rolled and IRREVERSIBLE: once a game
 * has digits + locked_at, it can't be re-rolled (no fishing for 0/3/7).
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: contest } = await admin
    .from("v2_contests")
    .select("id, contest_type, org_id, config")
    .eq("id", contestId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!contest || contest.contest_type !== "boxes") return NextResponse.json({ error: "Boxes pool not found" }, { status: 404 });

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const action = body.action ?? "";
  const cfg = { ...((contest.config as Record<string, unknown>) ?? {}) };
  const drawn = cfg.phase === "locked" || cfg.phase === "final" || !!cfg.drawn_at;

  // Simple phase advances. Once numbers are drawn the board is permanent, so a
  // draft phase (close/reopen/open) can never be re-entered — it would strand a
  // locked, scored pool back in a pre-draw state (and hide it from the home feed).
  if (action in PHASE_MOVES) {
    if (drawn) return NextResponse.json({ error: "Numbers are already drawn — the draft can't be reopened." }, { status: 409 });
    cfg.phase = PHASE_MOVES[action];
    const patch: Record<string, unknown> = { config: cfg };
    if (action === "open_primary") patch.status = "active";
    const { error } = await admin.from("v2_contests").update(patch).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: cfg.phase });
  }

  if (action === "draw") {
    const { data: games } = await admin
      .from("v2_boxes_games")
      .select("id, row_digits, col_digits, locked_at")
      .eq("contest_id", contestId);
    if (!games || games.length === 0) return NextResponse.json({ error: "No games to draw for." }, { status: 400 });
    if (games.some((g) => g.locked_at)) {
      return NextResponse.json({ error: "Numbers are already drawn — they can't be re-rolled." }, { status: 409 });
    }
    const now = new Date().toISOString();
    for (const g of games) {
      const { error } = await admin
        .from("v2_boxes_games")
        .update({ row_digits: drawDigits(), col_digits: drawDigits(), locked_at: now })
        .eq("id", g.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    cfg.phase = "locked";
    cfg.drawn_at = now;
    cfg.drawn_by = userId;
    const { error } = await admin.from("v2_contests").update({ config: cfg }).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "locked" });
  }

  if (action === "finalize") {
    cfg.phase = "final";
    const { error } = await admin.from("v2_contests").update({ config: cfg, status: "final" }).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "final" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
