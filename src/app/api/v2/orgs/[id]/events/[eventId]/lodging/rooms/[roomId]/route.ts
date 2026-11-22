import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { normalizeRoom, ROOM_SELECT } from "@/lib/v2/lodging";

/** Update (PATCH) or delete (DELETE) a single room. Admins only. */

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; eventId: string; roomId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, roomId } = await params;

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
  const norm = normalizeRoom(body, { partial: true });
  if ("error" in norm) return NextResponse.json(norm, { status: 400 });

  const { data, error } = await admin
    .from("v2_lodging_rooms")
    .update({ ...norm, updated_at: new Date().toISOString() })
    .eq("id", roomId)
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .select(ROOM_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ room: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; roomId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, roomId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  // Assignments cascade via FK ON DELETE CASCADE.
  const { error } = await admin.from("v2_lodging_rooms").delete().eq("id", roomId).eq("org_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
