import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { resolveContestPayeeId } from "@/lib/v2/finance/payees";
import { pickName } from "@/lib/v2/profile";
import { orgNameMode } from "@/lib/v2/orgs";

type Params = Promise<{ id: string; contestId: string }>;

/**
 * Buy-in payments for a GROUP contest (event-less — the event ledger route doesn't
 * apply). The buy-in itself is DERIVED (config.entry_cents); only payments are
 * stored, as payee-attributed ledger rows (contest_id + payee_user_id = collector),
 * so "paid" is whatever's been recorded. Accessible to org admins AND the contest's
 * collector (a non-admin Loozer can collect for their own contest).
 *
 *   GET            → roster: each participant + how much they've paid + the fee.
 *   POST  {userId} → mark paid: record a payment for the outstanding balance.
 *   DELETE ?userId → unmark: remove this member's payments for the contest.
 */
async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  const { data: contest } = await admin
    .from("v2_contests")
    .select("id, name, org_id, event_id, config, collected_by, created_by")
    .eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest) return { error: NextResponse.json({ error: "Contest not found" }, { status: 404 }) };
  const payeeId = resolveContestPayeeId(contest as { collected_by: string | null; created_by: string | null }, null);
  const allowed = userId === payeeId || (await isOrgAdmin(admin, userId, orgId));
  if (!allowed) return { error: NextResponse.json({ error: "Only the collector or an admin" }, { status: 403 }) };
  const entryCents = Number((contest.config as { entry_cents?: number } | null)?.entry_cents) || 0;
  return { admin, userId, contest, payeeId, entryCents };
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  const [{ data: parts }, { data: pays }] = await Promise.all([
    g.admin.from("v2_contest_participants").select("user_id, profile:v2_profiles(id, display_name, first_name, last_name, nickname)").eq("contest_id", contestId),
    g.admin.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment"),
  ]);
  const paidByUser = new Map<string, number>();
  for (const p of pays || []) paidByUser.set(p.user_id as string, (paidByUser.get(p.user_id as string) || 0) + ((p.amount_cents as number) || 0));
  const mode = await orgNameMode(g.admin, orgId);

  const roster = (parts || []).map((p) => {
    const prof = Array.isArray(p.profile) ? p.profile[0] : p.profile;
    return {
      userId: p.user_id as string,
      name: prof ? pickName(prof, mode, "Member") : "Member",
      paidCents: paidByUser.get(p.user_id as string) || 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ entryCents: g.entryCents, payeeId: g.payeeId, roster });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  if (g.entryCents <= 0) return NextResponse.json({ error: "This contest has no buy-in" }, { status: 400 });
  if (!g.payeeId) return NextResponse.json({ error: "No collector set" }, { status: 400 });

  let body: { userId?: string; method?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Must be a participant.
  const { data: part } = await g.admin.from("v2_contest_participants").select("user_id").eq("contest_id", contestId).eq("user_id", body.userId).maybeSingle();
  if (!part) return NextResponse.json({ error: "Not in this contest" }, { status: 400 });

  // Pay the outstanding balance (entry − already paid).
  const { data: pays } = await g.admin.from("v2_financial_transactions").select("amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("user_id", body.userId);
  const paid = (pays || []).reduce((s, p) => s + ((p.amount_cents as number) || 0), 0);
  const outstanding = g.entryCents - paid;
  if (outstanding <= 0) return NextResponse.json({ ok: true, alreadyPaid: true });

  const { error } = await g.admin.from("v2_financial_transactions").insert({
    org_id: orgId, event_id: null, user_id: body.userId,
    type: "payment", source: "deposit", amount_cents: outstanding,
    method: (body.method || "").trim() || "Venmo",
    description: `${(g.contest.name as string) || "Contest"} buy-in`,
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
    .eq("contest_id", contestId).eq("type", "payment").eq("user_id", targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
