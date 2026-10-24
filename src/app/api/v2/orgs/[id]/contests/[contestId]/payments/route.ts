import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { resolveContestPayeeId } from "@/lib/v2/finance/payees";
import { pickName } from "@/lib/v2/profile";
import { orgNameMode } from "@/lib/v2/orgs";

type Params = Promise<{ id: string; contestId: string }>;

/**
 * Entry (buy-in) payments for a GROUP contest. The buy-in is DERIVED — Pick'em's is a
 * flat config.entry_cents per participant; Squares' is per-member (squares owned ×
 * cell cost). Only the payments are stored (payee-attributed ledger rows), so "paid"
 * is whatever's been recorded. Collector or org admin.
 *
 *   GET            → roster: each member + what they owe + what they've paid.
 *   POST  {userId} → mark paid: record a payment for their outstanding balance.
 *   DELETE ?userId → unmark: remove this member's payments for the contest.
 */
async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  const { data: contest } = await admin
    .from("v2_contests")
    .select("id, name, org_id, event_id, contest_type, config, collected_by, created_by")
    .eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest) return { error: NextResponse.json({ error: "Contest not found" }, { status: 404 }) };
  const payeeId = resolveContestPayeeId(contest as { collected_by: string | null; created_by: string | null }, null);
  const allowed = userId === payeeId || (await isOrgAdmin(admin, userId, orgId));
  if (!allowed) return { error: NextResponse.json({ error: "Only the collector or an admin" }, { status: 403 }) };
  const cfg = (contest.config as { entry_cents?: number; cell_cost_cents?: number } | null) ?? {};
  const isSquares = contest.contest_type === "squares";
  const entryCents = Number(cfg.entry_cents) || 0;
  const cellCostCents = Number(cfg.cell_cost_cents) || 0;
  return { admin, userId, contest, payeeId, isSquares, entryCents, cellCostCents };
}

/** Each member's entry obligation: Pick'em = flat fee; Squares = squares × cost. */
async function owedByMember(
  admin: ReturnType<typeof v2AdminClient>,
  contestId: string,
  isSquares: boolean,
  entryCents: number,
  cellCostCents: number,
): Promise<Map<string, number>> {
  const owed = new Map<string, number>();
  if (isSquares) {
    const { data: cells } = await admin.from("v2_squares_cells").select("user_id").eq("contest_id", contestId).not("user_id", "is", null);
    for (const c of cells || []) owed.set(c.user_id as string, (owed.get(c.user_id as string) || 0) + cellCostCents);
  } else {
    const { data: parts } = await admin.from("v2_contest_participants").select("user_id").eq("contest_id", contestId);
    for (const p of parts || []) owed.set(p.user_id as string, entryCents);
  }
  return owed;
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  const [owed, { data: pays }] = await Promise.all([
    owedByMember(g.admin, contestId, g.isSquares, g.entryCents, g.cellCostCents),
    // Entry payments only — source='deposit'. Winnings credits (source='winnings',
    // also type='payment') must NOT count toward a member's buy-in.
    g.admin.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("source", "deposit"),
  ]);
  const paidByUser = new Map<string, number>();
  for (const p of pays || []) paidByUser.set(p.user_id as string, (paidByUser.get(p.user_id as string) || 0) + ((p.amount_cents as number) || 0));

  const uids = [...owed.keys()];
  const { data: profs } = uids.length
    ? await g.admin.from("v2_profiles").select("id, display_name, first_name, last_name, nickname").in("id", uids)
    : { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; nickname: string | null }[] };
  const mode = await orgNameMode(g.admin, orgId);
  const nameById = new Map((profs || []).map((p) => [p.id as string, pickName(p, mode, "Member")]));

  const roster = uids
    .map((uid) => ({ userId: uid, name: nameById.get(uid) || "Member", owedCents: owed.get(uid) || 0, paidCents: paidByUser.get(uid) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // entryCents kept for back-compat (Pick'em pot display); owedCents is per-member.
  return NextResponse.json({ entryCents: g.entryCents, payeeId: g.payeeId, roster });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  if (!g.payeeId) return NextResponse.json({ error: "No collector set" }, { status: 400 });

  let body: { userId?: string; method?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const owed = await owedByMember(g.admin, contestId, g.isSquares, g.entryCents, g.cellCostCents);
  const owedForUser = owed.get(body.userId) || 0;
  if (owedForUser <= 0) return NextResponse.json({ error: g.isSquares ? "They own no squares" : "This contest has no buy-in" }, { status: 400 });

  const { data: pays } = await g.admin.from("v2_financial_transactions").select("amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("source", "deposit").eq("user_id", body.userId);
  const paid = (pays || []).reduce((s, p) => s + ((p.amount_cents as number) || 0), 0);
  const outstanding = owedForUser - paid;
  if (outstanding <= 0) return NextResponse.json({ ok: true, alreadyPaid: true });

  const { error } = await g.admin.from("v2_financial_transactions").insert({
    org_id: orgId, event_id: null, user_id: body.userId,
    type: "payment", source: "deposit", amount_cents: outstanding,
    method: (body.method || "").trim() || "Venmo",
    description: `${(g.contest.name as string) || "Contest"} ${g.isSquares ? "squares" : "buy-in"}`,
    payee_user_id: g.payeeId, contest_id: contestId, created_by: g.userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  const targetId = new URL(request.url).searchParams.get("userId");
  if (!targetId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { error } = await g.admin.from("v2_financial_transactions").delete()
    .eq("contest_id", contestId).eq("type", "payment").eq("source", "deposit").eq("user_id", targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
