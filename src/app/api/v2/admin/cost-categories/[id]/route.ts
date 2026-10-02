import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isSystemAdmin } from "@/lib/v2/orgs";
import { COST_CATEGORY_SELECT, type CostCategory } from "@/lib/v2/cost-categories";

type Params = Promise<{ id: string }>;

async function requireSystemAdmin(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isSystemAdmin(admin, realUserId))) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  return { admin };
}

const EDITABLE = new Set(["label", "icon", "sort_order", "is_active"]);

export async function PATCH(request: Request, { params }: { params: Params }) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v;
  if ("label" in patch) {
    const l = String(patch.label || "").trim();
    if (!l) return NextResponse.json({ error: "Label can't be empty" }, { status: 400 });
    patch.label = l;
  }
  if ("icon" in patch) patch.icon = String(patch.icon || "").trim() || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin.from("v2_cost_categories").update(patch).eq("id", id).select(COST_CATEGORY_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data as CostCategory });
}

/** Delete a category — refused if any cost item still uses it (deactivate instead). */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;
  const { id } = await params;

  const { data: cat } = await admin.from("v2_cost_categories").select("key").eq("id", id).maybeSingle();
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await admin.from("v2_cost_items").select("id", { count: "exact", head: true }).eq("category", cat.key);
  if (count && count > 0) {
    return NextResponse.json({ error: `In use by ${count} cost item${count === 1 ? "" : "s"}. Deactivate it instead.` }, { status: 409 });
  }

  const { error } = await admin.from("v2_cost_categories").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
