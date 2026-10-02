import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { COST_ITEM_SELECT } from "@/lib/v2/cost-items";

/**
 * Event cost items (#213) — the universal money catalog. GET lists an event's
 * items (any member; UI gates the breakdown to admins). POST creates a manual
 * item (admins). Auto items (contest/side-game buy-ins) are created by their
 * source, not here.
 */


export async function GET(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data, error } = await admin
    .from("v2_cost_items").select(COST_ITEM_SELECT)
    .eq("org_id", orgId).eq("event_id", eventId).order("sort_order").order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data, error } = await admin
    .from("v2_cost_items")
    .insert({
      org_id: orgId,
      event_id: eventId,
      name,
      amount_cents: Number.isFinite(body.amount_cents as number) ? (body.amount_cents as number) : 0,
      category: typeof body.category === "string" ? body.category : null,
      included_in_trip_cost: !!body.included_in_trip_cost,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      sort_order: Number.isFinite(body.sort_order as number) ? (body.sort_order as number) : 0,
      source_type: "manual",
      created_by: userId,
    })
    .select(COST_ITEM_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
