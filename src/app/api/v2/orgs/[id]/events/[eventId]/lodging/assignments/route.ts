import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { ASSIGNMENT_SELECT } from "@/lib/v2/lodging";

/**
 * Room assignments for an event. Admins only.
 *  POST   { room_id, user_id }  → assign, or MOVE if already placed (upsert on
 *                                 event_id+user_id, mirroring v1 auto-reassign).
 *  DELETE { user_id } | { room_id } | { all: true } → unassign one / clear a room / clear all.
 */

export async function POST(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

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
  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  const assignee = typeof body.user_id === "string" ? body.user_id : null;
  if (!roomId || !assignee) return NextResponse.json({ error: "room_id and user_id are required" }, { status: 400 });

  // The room must belong to this org+event.
  const { data: room } = await admin
    .from("v2_lodging_rooms")
    .select("id")
    .eq("id", roomId)
    .eq("org_id", orgId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: "Unknown room" }, { status: 404 });

  const { data, error } = await admin
    .from("v2_lodging_assignments")
    .upsert(
      { room_id: roomId, org_id: orgId, event_id: eventId, user_id: assignee },
      { onConflict: "event_id,user_id" },
    )
    .select(ASSIGNMENT_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine for nothing-to-do
  }

  let q = admin.from("v2_lodging_assignments").delete().eq("org_id", orgId).eq("event_id", eventId);
  if (body.all === true) {
    // clear every assignment for the event
  } else if (typeof body.user_id === "string") {
    q = q.eq("user_id", body.user_id);
  } else if (typeof body.room_id === "string") {
    q = q.eq("room_id", body.room_id);
  } else {
    return NextResponse.json({ error: "Specify user_id, room_id, or all" }, { status: 400 });
  }
  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
