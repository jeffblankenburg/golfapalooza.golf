import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { resolveContestPayeeId } from "@/lib/v2/finance/payees";

type Params = Promise<{ id: string; contestId: string }>;

/**
 * Settle Pick'em WINNINGS (issue #5b). The winner + amount are derived from the
 * leaderboard × payout_splits (see loadPickemPayouts); this route only records how a
 * winner was paid. Three methods:
 *   - "Venmo" / "PayPal"  → external cash-out, stored in v2_pickem_payouts (no balance
 *                            effect — they got real money).
 *   - "account"           → a source='winnings' ledger credit attributed to the
 *                            collector, which offsets what the member owes.
 * Collector or org admin only.
 *
 *   POST  {action:"mark_paid",   userId, amountCents, method, note?}
 *   POST  {action:"unmark_paid", userId}   → clears both stores for that winner.
 */
async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  const { data: contest } = await admin
    .from("v2_contests")
    .select("id, name, org_id, contest_type, collected_by, created_by")
    .eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest) return { error: NextResponse.json({ error: "Contest not found" }, { status: 404 }) };
  if (contest.contest_type !== "pickem") return { error: NextResponse.json({ error: "Not a Pick'em contest" }, { status: 400 }) };
  const payeeId = resolveContestPayeeId(contest as { collected_by: string | null; created_by: string | null }, null);
  const allowed = userId === payeeId || (await isOrgAdmin(admin, userId, orgId));
  if (!allowed) return { error: NextResponse.json({ error: "Only the collector or an admin" }, { status: 403 }) };
  return { admin, userId, contest, payeeId };
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: { action?: string; userId?: string; amountCents?: number; method?: string; note?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.userId) return NextResponse.json({ error: "Missing member." }, { status: 400 });

  // Clear every settlement record for this winner (both stores).
  if (body.action === "unmark_paid") {
    const [a, b] = await Promise.all([
      g.admin.from("v2_pickem_payouts").delete().eq("contest_id", contestId).eq("user_id", body.userId),
      g.admin.from("v2_financial_transactions").delete().eq("contest_id", contestId).eq("user_id", body.userId).eq("type", "payment").eq("source", "winnings"),
    ]);
    const err = a.error || b.error;
    if (err) return NextResponse.json({ error: err.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "mark_paid") {
    const amount = Math.max(0, Math.round(Number(body.amountCents) || 0));
    if (amount <= 0) return NextResponse.json({ error: "Nothing to pay." }, { status: 400 });
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 200) : null;
    const isAccount = (body.method || "").trim().toLowerCase() === "account";

    // A winner is paid exactly one way — clear any prior record before writing.
    await Promise.all([
      g.admin.from("v2_pickem_payouts").delete().eq("contest_id", contestId).eq("user_id", body.userId),
      g.admin.from("v2_financial_transactions").delete().eq("contest_id", contestId).eq("user_id", body.userId).eq("type", "payment").eq("source", "winnings"),
    ]);

    if (isAccount) {
      if (!g.payeeId) return NextResponse.json({ error: "No collector set to credit against." }, { status: 400 });
      const { error } = await g.admin.from("v2_financial_transactions").insert({
        org_id: orgId, event_id: null, user_id: body.userId,
        type: "payment", source: "winnings", amount_cents: amount, method: "Account",
        description: `${(g.contest.name as string) || "Pick'em"} winnings (applied to account)`,
        notes: note, payee_user_id: g.payeeId, contest_id: contestId, created_by: g.userId,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const method = (body.method || "").trim() || null;
    const { error } = await g.admin.from("v2_pickem_payouts").upsert({
      contest_id: contestId, user_id: body.userId, paid_cents: amount, method, note,
      paid_at: new Date().toISOString(), paid_by: g.userId,
    }, { onConflict: "contest_id,user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
