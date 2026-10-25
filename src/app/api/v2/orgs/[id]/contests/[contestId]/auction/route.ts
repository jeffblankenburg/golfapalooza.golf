import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { assignTeam, unassignTeam } from "@/lib/v2/contests/auction-server";

type Params = Promise<{ id: string; contestId: string }>;

async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  const { data: contest } = await admin.from("v2_contests").select("id, config").eq("id", contestId).eq("org_id", orgId).eq("contest_type", "auction").maybeSingle();
  if (!contest) return { error: NextResponse.json({ error: "Auction not found" }, { status: 404 }) };
  return { admin, userId, config: (contest.config as Record<string, unknown> | null) ?? {} };
}

/**
 * Auction management (admin / recorder):
 *   { action:"assign", entityId, userId, bidCents }  — record a winning bid (0 = bonus).
 *   { action:"unassign", entityId }                  — undo an assignment.
 *   { action:"settings", tournament_id?, salary_cap_cents?, bid_increment_cents?,
 *                        teams_per_player?, first_participant_id? }  — merge config.
 *   { action:"shuffle" }                             — (re)roll the throwout order seed.
 *   { action:"complete", complete:boolean }          — open/close the auction.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  if (body.action === "assign") {
    if (!body.entityId || !body.userId) return NextResponse.json({ error: "entityId + userId required" }, { status: 400 });
    const r = await assignTeam(g.admin, contestId, { entityId: body.entityId as string, userId: body.userId as string, bidCents: Number(body.bidCents) || 0, assignedBy: g.userId });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    // Clear the block if we just sold the lot that was up.
    if (g.config.on_block_entity_id) {
      const cfg = { ...g.config }; delete cfg.on_block_entity_id;
      await g.admin.from("v2_contests").update({ config: cfg, updated_at: new Date().toISOString() }).eq("id", contestId);
    }
    return NextResponse.json({ ok: true });
  }
  if (body.action === "unassign") {
    if (!body.entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });
    const r = await unassignTeam(g.admin, contestId, body.entityId as string);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
  }

  // Config-merged actions.
  const cfg = { ...g.config };
  if (body.action === "settings") {
    if ("tournament_id" in body) cfg.tournament_id = (body.tournament_id as string) || undefined;
    if ("salary_cap_cents" in body) cfg.salary_cap_cents = Math.max(0, Math.round(Number(body.salary_cap_cents) || 0)) || undefined;
    if ("bid_increment_cents" in body) cfg.bid_increment_cents = Math.max(0, Math.round(Number(body.bid_increment_cents) || 0)) || undefined;
    if ("teams_per_player" in body) cfg.teams_per_player = Math.max(1, Math.round(Number(body.teams_per_player) || 1));
    if ("first_participant_id" in body) cfg.first_participant_id = (body.first_participant_id as string) || undefined;
    if ("payout_champion_cents" in body) cfg.payout_champion_cents = Math.max(0, Math.round(Number(body.payout_champion_cents) || 0)) || undefined;
    if ("payout_runner_up_cents" in body) cfg.payout_runner_up_cents = Math.max(0, Math.round(Number(body.payout_runner_up_cents) || 0)) || undefined;
    if ("payout_points_cents" in body && Array.isArray(body.payout_points_cents)) {
      const arr = (body.payout_points_cents as unknown[]).map((n) => Math.max(0, Math.round(Number(n) || 0)));
      cfg.payout_points_cents = arr.some((n) => n > 0) ? arr : undefined;
    }
  } else if (body.action === "set_block") {
    cfg.on_block_entity_id = (body.entityId as string) || undefined;
  } else if (body.action === "clear_block") {
    cfg.on_block_entity_id = undefined;
  } else if (body.action === "shuffle") {
    cfg.order_seed = randomUUID();
  } else if (body.action === "complete") {
    cfg.auction_complete = body.complete === true;
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  // Strip undefined so cleared keys fall back to defaults.
  for (const k of Object.keys(cfg)) if (cfg[k] === undefined) delete cfg[k];
  const { error } = await g.admin.from("v2_contests").update({ config: cfg, updated_at: new Date().toISOString() }).eq("id", contestId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
