import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * Group-chat membership management (#192, v1 parity).
 *   POST   { userIds:[…] } — add members (group only; any member may add; must be
 *                            active org members of the room's org).
 *   DELETE { userId }      — remove a member. Anyone may remove themselves; only
 *                            the room creator may remove someone else.
 * DMs have a fixed two-person roster and reject both.
 */

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (a.room.room_kind !== "regular") {
    return NextResponse.json({ error: "This channel manages its own membership" }, { status: 400 });
  }
  if (a.room.type !== "group") {
    return NextResponse.json({ error: "You can only add people to a group chat" }, { status: 400 });
  }

  let body: { userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const userIds = [...new Set((body.userIds || []).filter((x): x is string => typeof x === "string"))];
  if (userIds.length === 0) return NextResponse.json({ error: "No members to add" }, { status: 400 });

  // Only people who are active members of the room's org can be added.
  const eligible: string[] = [];
  for (const uid of userIds) {
    if (await isOrgMember(a.admin, uid, a.room.org_id)) eligible.push(uid);
  }
  if (eligible.length === 0) {
    return NextResponse.json({ error: "None of those people are in this group" }, { status: 400 });
  }

  const { error } = await a.admin
    .from("v2_chat_room_members")
    .upsert(
      eligible.map((uid) => ({ room_id: roomId, user_id: uid, role: "member" })),
      { onConflict: "room_id,user_id", ignoreDuplicates: true },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, added: eligible.length });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (a.room.room_kind !== "regular") {
    return NextResponse.json({ error: "This channel manages its own membership" }, { status: 400 });
  }
  if (a.room.type !== "group") {
    return NextResponse.json({ error: "You can't remove people from a direct message" }, { status: 400 });
  }

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const target = body.userId;
  if (!target) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Removing yourself is always allowed; removing someone else requires being the
  // room's creator.
  if (target !== a.userId) {
    const { data: me } = await a.admin
      .from("v2_chat_room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", a.userId)
      .maybeSingle();
    if (me?.role !== "creator") {
      return NextResponse.json({ error: "Only the group creator can remove others" }, { status: 403 });
    }
  }

  const { error } = await a.admin
    .from("v2_chat_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", target);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
