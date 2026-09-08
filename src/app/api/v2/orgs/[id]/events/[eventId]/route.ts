import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

/**
 * Update (PATCH) or delete (DELETE) a single event. Admins only.
 * Activating an event archives the org's other active event (single-active).
 */

const STATUSES = ["draft", "active", "archived"];

async function guard(request: Request, orgId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return { error: "Not allowed", status: 403 as const };
  }
  return { admin, userId };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id, eventId } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: {
    name?: string;
    year?: number | null;
    start_date?: string | null;
    end_date?: string | null;
    status?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    patch.name = name;
  }
  if ("year" in body) patch.year = body.year ?? null;
  if ("start_date" in body) patch.start_date = body.start_date || null;
  if ("end_date" in body) patch.end_date = body.end_date || null;
  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === "active") {
      await g.admin
        .from("v2_events")
        .update({ status: "archived" })
        .eq("org_id", id)
        .eq("status", "active")
        .neq("id", eventId);
    }
  }

  const { error } = await g.admin
    .from("v2_events")
    .update(patch)
    .eq("id", eventId)
    .eq("org_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; eventId: string }> }
) {
  const { id, eventId } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });
  const { error } = await g.admin
    .from("v2_events")
    .delete()
    .eq("id", eventId)
    .eq("org_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
