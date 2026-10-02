import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { OPTION_GROUP_SELECT, type OptionGroup } from "@/lib/v2/options";

type Params = Promise<{ id: string; eventId: string; groupId: string }>;

const EDITABLE = new Set(["name", "description", "icon", "sort_order"]);

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, groupId } = await params;
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
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin.from("v2_option_groups").update(patch).eq("id", groupId).eq("org_id", orgId).eq("event_id", eventId).select(OPTION_GROUP_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data as OptionGroup });
}

/** Delete a group. Its options fall back to ungrouped (FK ON DELETE SET NULL). */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, groupId } = await params;
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { error } = await admin.from("v2_option_groups").delete().eq("id", groupId).eq("org_id", orgId).eq("event_id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
