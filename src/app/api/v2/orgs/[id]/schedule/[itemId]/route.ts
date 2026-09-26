import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { normalizeScheduleItem } from "@/lib/v2/schedule";

const SELECT = "id, event_id, title, description, location, day, end_day, start_time, end_time, all_day, sort_order, kind, activity_type, activity_id";

/**
 * Edit or delete a single GROUP-level schedule item (#208). Org admins only.
 * Scoped to this org's group items (event_id IS NULL) so it can't touch an event's
 * agenda item — those go through the event-scoped endpoint.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, itemId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const norm = normalizeScheduleItem(body);
  if ("error" in norm) return NextResponse.json(norm, { status: 400 });
  if (Object.keys(norm).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data, error } = await admin
    .from("v2_schedule_items")
    .update({ ...norm, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("org_id", orgId)
    .is("event_id", null)
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, itemId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const { error } = await admin
    .from("v2_schedule_items")
    .delete()
    .eq("id", itemId)
    .eq("org_id", orgId)
    .is("event_id", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
