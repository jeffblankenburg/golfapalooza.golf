import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { COST_ITEM_SELECT } from "@/lib/v2/cost-items";

/** Edit or delete a single cost item (#213). Org admins only. */

const EDITABLE = new Set(["name", "amount_cents", "category", "included_in_trip_cost", "linked_option_id", "notes", "sort_order"]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; eventId: string; itemId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, itemId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v;
  if ("name" in patch) {
    const n = String(patch.name || "").trim();
    if (!n) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    patch.name = n;
  }
  // Reconcile to one bucket: setting an option clears the trip-cost flag.
  if (patch.linked_option_id) patch.included_in_trip_cost = false;
  if (patch.included_in_trip_cost === true) patch.linked_option_id = null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("v2_cost_items").update(patch)
    .eq("id", itemId).eq("org_id", orgId).eq("event_id", eventId)
    .select(COST_ITEM_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-choice funding links (#218 phase B): a cost_item linked to a choice-type
  // option can fund specific choice values. Unlinking / moving to Trip Cost clears them.
  const clearedLink = patch.included_in_trip_cost === true || ("linked_option_id" in patch && !patch.linked_option_id);
  if (clearedLink) {
    await admin.from("v2_cost_item_option_choices").delete().eq("cost_item_id", itemId);
  } else if ("choice_values" in body) {
    await admin.from("v2_cost_item_option_choices").delete().eq("cost_item_id", itemId);
    const cvs = Array.isArray(body.choice_values) ? (body.choice_values as unknown[]).filter((x): x is string => typeof x === "string" && !!x) : [];
    if (cvs.length) await admin.from("v2_cost_item_option_choices").insert(cvs.map((choice_value) => ({ cost_item_id: itemId, choice_value })));
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; eventId: string; itemId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, itemId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  // Only manual items are deletable here; source-linked items are removed with
  // their source (e.g. deleting the contest).
  const { data: item } = await admin.from("v2_cost_items").select("source_type").eq("id", itemId).eq("org_id", orgId).maybeSingle();
  if (item && item.source_type !== "manual") {
    return NextResponse.json({ error: "This cost comes from a contest or other item; remove it there." }, { status: 400 });
  }
  const { error } = await admin.from("v2_cost_items").delete().eq("id", itemId).eq("org_id", orgId).eq("event_id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
