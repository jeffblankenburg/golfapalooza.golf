import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { OPTION_SELECT, OPTION_TYPES, normalizeChoices, type Option, type OptionType } from "@/lib/v2/options";

type Params = Promise<{ id: string; eventId: string; optionId: string }>;

const EDITABLE = new Set(["name", "description", "sort_order", "group_id", "is_required", "icon", "depends_on_option_id", "allow_none", "none_label"]);

/** Edit an option (#216). Admins only. */
export async function PATCH(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, optionId } = await params;

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
  if ("description" in patch) patch.description = String(patch.description || "").trim() || null;
  if ("icon" in patch) patch.icon = String(patch.icon || "").trim() || null;
  if ("group_id" in patch) patch.group_id = patch.group_id || null;
  if ("depends_on_option_id" in patch) patch.depends_on_option_id = patch.depends_on_option_id || null;
  if ("is_required" in patch) patch.is_required = !!patch.is_required;
  if ("allow_none" in patch) patch.allow_none = !!patch.allow_none;
  if ("none_label" in patch) patch.none_label = String(patch.none_label || "").trim() || null;

  // Type / choices / max_total need the effective type to sanitize correctly.
  const hasType = OPTION_TYPES.some((t) => t.type === body.option_type);
  const typeChanging = hasType;
  if (typeChanging) patch.option_type = body.option_type;
  if (typeChanging || "choices" in body || "max_total" in body) {
    const { data: cur } = await admin.from("v2_options").select("option_type, choices, max_total").eq("id", optionId).eq("event_id", eventId).maybeSingle();
    if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const effType = (typeChanging ? (body.option_type as OptionType) : (cur.option_type as OptionType));
    patch.choices = normalizeChoices("choices" in body ? body.choices : cur.choices, effType);
    patch.max_total = effType === "quantity" ? (typeof body.max_total === "number" ? body.max_total : (("max_total" in body) ? null : cur.max_total)) : null;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from("v2_options").update(patch).eq("id", optionId).eq("org_id", orgId).eq("event_id", eventId)
    .select(OPTION_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ option: data as Option });
}

/** Delete an option (#216). Admins only. Unlinks its cost_items (back to unreconciled)
 *  and cascades member selections via FK. */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, optionId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  // cost_items.linked_option_id has no FK — null them so they don't dangle.
  await admin.from("v2_cost_items").update({ linked_option_id: null, updated_at: new Date().toISOString() }).eq("linked_option_id", optionId);
  const { error } = await admin.from("v2_options").delete().eq("id", optionId).eq("org_id", orgId).eq("event_id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
