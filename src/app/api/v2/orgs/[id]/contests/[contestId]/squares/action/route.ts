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
 * Squares lifecycle (#230). Admin advances the draft phases and triggers the
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
  if (!contest || contest.contest_type !== "squares") return NextResponse.json({ error: "Squares pool not found" }, { status: 404 });

  let body: {
    action?: string;
    gameId?: string;
    revealAt?: string | null;
    userId?: string;
    paidCents?: number;
    note?: string | null;
    items?: { gameId: string; paidCents: number }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const action = body.action ?? "";
  const cfg = { ...((contest.config as Record<string, unknown>) ?? {}) };
  const boardLocked = cfg.phase === "locked" || cfg.phase === "final" || !!cfg.board_locked_at;
  const REVEAL_LEAD_DAYS = Number.isFinite(cfg.reveal_lead_days) ? (cfg.reveal_lead_days as number) : 7;

  // Simple phase advances. Once the board is locked it's permanent, so a draft
  // phase (close/reopen/open) can never be re-entered — it would strand a locked
  // pool back in a pre-reveal state (and change who owns what).
  if (action in PHASE_MOVES) {
    if (boardLocked) return NextResponse.json({ error: "The board is locked — the draft can't be reopened." }, { status: 409 });
    cfg.phase = PHASE_MOVES[action];
    const patch: Record<string, unknown> = { config: cfg };
    if (action === "open_primary") patch.status = "active";
    const { error } = await admin.from("v2_contests").update(patch).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: cfg.phase });
  }

  // Hide the pool from members (gear "Visible to members" OFF) — back to setup.
  // Only valid before buying has progressed; once secondary/closed/locked it's the
  // detail-page lifecycle's job. Symmetric with open_primary.
  if (action === "back_to_setup") {
    if (boardLocked) return NextResponse.json({ error: "The board is locked — it can't be hidden." }, { status: 409 });
    if (cfg.phase !== "setup" && cfg.phase !== "primary") {
      return NextResponse.json({ error: "The draft is already underway — manage visibility on the detail page." }, { status: 409 });
    }
    cfg.phase = "setup";
    const { error } = await admin.from("v2_contests").update({ config: cfg, status: "draft" }).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "setup" });
  }

  // Lock the board (ownership frozen) and seed each game's default reveal time —
  // a week before kickoff — without drawing any numbers yet. Reveals happen
  // per-game after this (scheduled by the cron, or by hand).
  if (action === "lock_board") {
    const { data: games } = await admin.from("v2_squares_games").select("id, start_time, reveal_at, locked_at").eq("contest_id", contestId);
    if (!games || games.length === 0) return NextResponse.json({ error: "No games yet." }, { status: 400 });
    for (const g of games) {
      if (g.reveal_at || g.locked_at || !g.start_time) continue;
      const revealAt = new Date(new Date(g.start_time as string).getTime() - REVEAL_LEAD_DAYS * 86400000).toISOString();
      await admin.from("v2_squares_games").update({ reveal_at: revealAt }).eq("id", g.id);
    }
    cfg.phase = "locked";
    cfg.board_locked_at = new Date().toISOString();
    cfg.board_locked_by = userId;
    const { error } = await admin.from("v2_contests").update({ config: cfg }).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "locked" });
  }

  // Set / clear a single game's scheduled reveal time (admin override).
  if (action === "schedule_reveal") {
    const gameId = body.gameId;
    if (!gameId) return NextResponse.json({ error: "Missing game." }, { status: 400 });
    const { data: g } = await admin.from("v2_squares_games").select("id, locked_at").eq("id", gameId).eq("contest_id", contestId).maybeSingle();
    if (!g) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    if (g.locked_at) return NextResponse.json({ error: "That game's numbers are already revealed." }, { status: 409 });
    const { error } = await admin.from("v2_squares_games").update({ reveal_at: body.revealAt || null }).eq("id", gameId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Reveal ONE game's numbers now (one-shot, irreversible). Locks the board first
  // if it isn't already (so ownership is frozen before any numbers show).
  if (action === "reveal_game") {
    const gameId = body.gameId;
    if (!gameId) return NextResponse.json({ error: "Missing game." }, { status: 400 });
    const { data: g } = await admin.from("v2_squares_games").select("id, locked_at").eq("id", gameId).eq("contest_id", contestId).maybeSingle();
    if (!g) return NextResponse.json({ error: "Game not found." }, { status: 404 });
    if (g.locked_at) return NextResponse.json({ error: "Those numbers are already revealed — they can't be re-rolled." }, { status: 409 });
    const now = new Date().toISOString();
    const { error } = await admin.from("v2_squares_games").update({ row_digits: drawDigits(), col_digits: drawDigits(), locked_at: now }).eq("id", gameId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!boardLocked) {
      cfg.phase = "locked";
      cfg.board_locked_at = now;
      cfg.board_locked_by = userId;
      await admin.from("v2_contests").update({ config: cfg }).eq("id", contestId);
    }
    return NextResponse.json({ ok: true, phase: "locked" });
  }

  // Reveal ALL remaining games now (the old all-at-once behavior).
  if (action === "reveal_all" || action === "draw") {
    const { data: games } = await admin.from("v2_squares_games").select("id, locked_at").eq("contest_id", contestId);
    if (!games || games.length === 0) return NextResponse.json({ error: "No games to reveal." }, { status: 400 });
    const now = new Date().toISOString();
    for (const g of games) {
      if (g.locked_at) continue; // skip already-revealed (one-shot per game)
      const { error } = await admin.from("v2_squares_games").update({ row_digits: drawDigits(), col_digits: drawDigits(), locked_at: now }).eq("id", g.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    cfg.phase = "locked";
    cfg.board_locked_at = cfg.board_locked_at ?? now;
    cfg.board_locked_by = cfg.board_locked_by ?? userId;
    cfg.drawn_at = now;
    const { error } = await admin.from("v2_contests").update({ config: cfg }).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "locked" });
  }

  // Mark a member paid for one game, or settle many games at once. Paid state is
  // per (member, game) so an admin can pay a single game now (each week of a slate)
  // or clear a member's whole-pool take in one shot (the master-payouts "pay it
  // all", which sends every unpaid game as `items`). A member's balance is the sum
  // across their game rows, so both paths reconcile.
  if (action === "mark_paid") {
    if (!body.userId) return NextResponse.json({ error: "Missing member." }, { status: 400 });
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
    const now = new Date().toISOString();
    // Bulk: one row per game in `items`. Single: `gameId` + `paidCents`.
    const rows = (body.items?.length
      ? body.items
      : body.gameId
        ? [{ gameId: body.gameId, paidCents: body.paidCents ?? 0 }]
        : []
    )
      .filter((r) => r.gameId)
      .map((r) => ({
        contest_id: contestId,
        user_id: body.userId!,
        game_id: r.gameId,
        paid_cents: Math.max(0, Math.round(r.paidCents ?? 0)),
        paid_at: now,
        paid_by: userId,
        note,
      }));
    if (rows.length === 0) return NextResponse.json({ error: "Missing game." }, { status: 400 });
    const { error } = await admin.from("v2_squares_payouts").upsert(rows, { onConflict: "contest_id,user_id,game_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  // Unmark one game (gameId given) or every game for a member (no gameId).
  if (action === "unmark_paid") {
    if (!body.userId) return NextResponse.json({ error: "Missing member." }, { status: 400 });
    let q = admin.from("v2_squares_payouts").delete().eq("contest_id", contestId).eq("user_id", body.userId);
    if (body.gameId) q = q.eq("game_id", body.gameId);
    const { error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "finalize") {
    cfg.phase = "final";
    const { error } = await admin.from("v2_contests").update({ config: cfg, status: "final" }).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "final" });
  }

  // Un-archive: back to the live, locked state (reveals/scoring resume).
  if (action === "unarchive") {
    cfg.phase = "locked";
    const { error } = await admin.from("v2_contests").update({ config: cfg, status: "active" }).eq("id", contestId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, phase: "locked" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
