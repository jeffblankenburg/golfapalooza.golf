import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * POST /api/v2/chat/rooms { orgId, type, name?, memberIds[] } — create a group,
 * or find-or-create a DM. Auth: bearer/cookie; org-membership gated.
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; type?: string; name?: string; memberIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  const type = body.type === "dm" ? "dm" : "group";
  const memberIds = [...new Set((body.memberIds || []).filter((id) => id && id !== userId))];
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  if (memberIds.length === 0) return NextResponse.json({ error: "Pick at least one person" }, { status: 400 });
  if (type === "dm" && memberIds.length !== 1) {
    return NextResponse.json({ error: "A DM is between two people" }, { status: 400 });
  }

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Find an existing DM between the two before creating a duplicate.
  if (type === "dm") {
    const other = memberIds[0];
    const { data: mineRooms } = await admin
      .from("v2_chat_room_members")
      .select("room_id")
      .eq("user_id", userId);
    const myIds = (mineRooms || []).map((r) => r.room_id);
    if (myIds.length) {
      const { data: shared } = await admin
        .from("v2_chat_room_members")
        .select("room_id")
        .eq("user_id", other)
        .in("room_id", myIds);
      const sharedIds = (shared || []).map((r) => r.room_id);
      if (sharedIds.length) {
        const { data: dm } = await admin
          .from("v2_chat_rooms")
          .select("id")
          .eq("type", "dm")
          .eq("org_id", orgId)
          .in("id", sharedIds)
          .limit(1)
          .maybeSingle();
        if (dm) return NextResponse.json({ room: dm, existed: true });
      }
    }
  }

  const { data: room, error } = await admin
    .from("v2_chat_rooms")
    .insert({ org_id: orgId, type, name: type === "group" ? (body.name || "").trim() || "New group" : null, created_by: userId })
    .select("id, type, name")
    .maybeSingle();
  if (error || !room) {
    return NextResponse.json({ error: error?.message || "Could not create room" }, { status: 500 });
  }

  const rows = [
    { room_id: room.id, user_id: userId, role: "creator" },
    ...memberIds.map((id) => ({ room_id: room.id, user_id: id, role: "member" })),
  ];
  await admin.from("v2_chat_room_members").insert(rows);

  return NextResponse.json({ room });
}

/**
 * GET /api/v2/chat/rooms?orgId= — the caller's rooms for an org, each with its
 * members, last message, unread count, and pin state. DMs derive their name +
 * avatar from the other member. Hidden rooms are omitted (a new message unhides).
 * Sorted pinned-first, then most-recent-activity.
 * Auth: bearer (native) or cookie (web); org-membership gated.
 */
export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // My memberships → the rooms I'm in (drop rooms I've hidden).
  const { data: mine } = await admin
    .from("v2_chat_room_members")
    .select("room_id, is_pinned, hidden_at")
    .eq("user_id", userId);
  const roomIds = (mine || []).filter((m) => !m.hidden_at).map((m) => m.room_id);
  if (roomIds.length === 0) return NextResponse.json({ rooms: [] });

  const pinnedBy = new Map((mine || []).map((m) => [m.room_id, m.is_pinned]));

  const [roomsRes, membersRes, receiptsRes, recentRes, hiddenRes, mode] = await Promise.all([
    admin.from("v2_chat_rooms").select("id, type, name, room_kind, created_at").in("id", roomIds).eq("org_id", orgId),
    admin
      .from("v2_chat_room_members")
      .select("room_id, user_id, member:v2_profiles(display_name, first_name, last_name, avatar_url)")
      .in("room_id", roomIds),
    admin.from("v2_chat_read_receipts").select("room_id, last_read_at").eq("user_id", userId).in("room_id", roomIds),
    // Recent-activity window: enough to derive last message + unread per room.
    admin
      .from("v2_chat_messages")
      .select("id, room_id, sender_id, content, image_url, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: false })
      .limit(600),
    admin.from("v2_chat_hidden_messages").select("message_id").eq("user_id", userId),
    orgNameMode(admin, orgId),
  ]);

  const lastReadBy = new Map((receiptsRes.data || []).map((r) => [r.room_id, r.last_read_at]));
  const hidden = new Set((hiddenRes.data || []).map((h) => h.message_id));

  const membersByRoom = new Map<string, { userId: string; displayName: string; avatarUrl: string | null }[]>();
  for (const m of membersRes.data || []) {
    const p = Array.isArray(m.member) ? m.member[0] : m.member;
    const list = membersByRoom.get(m.room_id) || [];
    list.push({ userId: m.user_id, displayName: pickName(p, mode), avatarUrl: p?.avatar_url ?? null });
    membersByRoom.set(m.room_id, list);
  }

  const lastByRoom = new Map<string, { content: string | null; image_url: string | null; created_at: string; sender_id: string }>();
  const unreadByRoom = new Map<string, number>();
  for (const msg of recentRes.data || []) {
    if (hidden.has(msg.id)) continue; // skip messages this user deleted
    if (!lastByRoom.has(msg.room_id)) lastByRoom.set(msg.room_id, msg);
    const lastRead = lastReadBy.get(msg.room_id);
    if (msg.sender_id !== userId && (!lastRead || msg.created_at > lastRead)) {
      unreadByRoom.set(msg.room_id, (unreadByRoom.get(msg.room_id) || 0) + 1);
    }
  }

  const rooms = (roomsRes.data || []).map((r) => {
    const members = membersByRoom.get(r.id) || [];
    const last = lastByRoom.get(r.id) || null;
    let name = r.name;
    let avatarUrl: string | null = null;
    if (r.type === "dm") {
      const other = members.find((m) => m.userId !== userId) || members[0];
      name = other?.displayName || "Direct message";
      avatarUrl = other?.avatarUrl ?? null;
    }
    return {
      id: r.id,
      type: r.type,
      roomKind: r.room_kind,
      name,
      avatarUrl,
      isPinned: !!pinnedBy.get(r.id),
      members,
      unread: unreadByRoom.get(r.id) || 0,
      lastMessage: last
        ? { content: last.content, imageUrl: last.image_url, createdAt: last.created_at }
        : null,
      lastActivity: last?.created_at || r.created_at,
    };
  });

  rooms.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return (b.lastActivity || "").localeCompare(a.lastActivity || "");
  });

  return NextResponse.json({ rooms });
}
