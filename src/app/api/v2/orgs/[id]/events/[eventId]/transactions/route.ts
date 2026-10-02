import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

/**
 * Event ledger writes (#214). Admins record the money that ISN'T derived: payments,
 * credits, winnings, and manual/expense/adjustment charges. Derived charges (Trip
 * Cost + option selections) are never written here. Owner/admin only.
 *
 * POST  { userId, kind, amountCents, method?, description?, notes? }
 *   kind → (type, source): payment→(payment,deposit) | credit→(payment,credit)
 *          | winnings→(payment,winnings) | charge→(charge,manual) | expense→(charge,expense)
 * DELETE ?txId=…   removes a ledger row (admins fix their own entries).
 */
const KIND_MAP: Record<string, { type: "charge" | "payment"; source: string }> = {
  payment: { type: "payment", source: "deposit" },
  credit: { type: "payment", source: "credit" },
  winnings: { type: "payment", source: "winnings" },
  charge: { type: "charge", source: "manual" },
  expense: { type: "charge", source: "expense" },
};

async function gate(request: Request, orgId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  return { admin, actorId: userId };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id: orgId, eventId } = await params;
  const g = await gate(request, orgId);
  if ("error" in g) return g.error;

  let body: { userId?: string; kind?: string; amountCents?: number; method?: string | null; description?: string | null; notes?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const map = KIND_MAP[body.kind || ""];
  if (!map) return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
  const amountCents = Math.round(Number(body.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "amount must be positive" }, { status: 400 });
  if (map.type === "charge" && !(body.description || "").trim()) return NextResponse.json({ error: "A charge needs a description" }, { status: 400 });

  // The member must belong to the org (lets admins charge a non-roster drop-in too).
  const { data: mem } = await g.admin.from("v2_memberships").select("user_id").eq("org_id", orgId).eq("user_id", body.userId).maybeSingle();
  if (!mem) return NextResponse.json({ error: "Not a member of this group" }, { status: 400 });

  const { data, error } = await g.admin.from("v2_financial_transactions").insert({
    org_id: orgId, event_id: eventId, user_id: body.userId,
    type: map.type, source: map.source, amount_cents: amountCents,
    description: (body.description || "").trim() || null,
    method: (body.method || "").trim() || null,
    notes: (body.notes || "").trim() || null,
    created_by: g.actorId,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { id: orgId, eventId } = await params;
  const g = await gate(request, orgId);
  if ("error" in g) return g.error;

  const txId = new URL(request.url).searchParams.get("txId");
  if (!txId) return NextResponse.json({ error: "txId required" }, { status: 400 });

  const { error } = await g.admin
    .from("v2_financial_transactions").delete()
    .eq("id", txId).eq("org_id", orgId).eq("event_id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
