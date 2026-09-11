import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * GET /api/v2/chat/search?orgId=&q= — full-text-ish search of message CONTENT
 * across the caller's rooms (ilike). Returns matching messages with room + sender
 * context, newest first. Excludes the caller's hidden messages.
 * Auth: bearer/cookie; org-membership gated.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  const q = (url.searchParams.get("q") || "").trim();
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  if (q.length < 2) return NextResponse.json({ results: [] });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: mine } = await admin
    .from("v2_chat_room_members")
    .select("room_id")
    .eq("user_id", userId);
  const roomIds = (mine || []).map((m) => m.room_id);
  if (roomIds.length === 0) return NextResponse.json({ results: [] });

  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const [matchRes, hiddenRes, roomsRes, membersRes, mode] = await Promise.all([
    admin
      .from("v2_chat_messages")
      .select("id, room_id, content, created_at, sender:v2_profiles!v2_chat_messages_sender_id_fkey(display_name, first_name, last_name)")
      .in("room_id", roomIds)
      .not("content", "is", null)
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("v2_chat_hidden_messages").select("message_id").eq("user_id", userId),
    admin.from("v2_chat_rooms").select("id, type, name").in("id", roomIds),
    admin
      .from("v2_chat_room_members")
      .select("room_id, user_id, member:v2_profiles(display_name, first_name, last_name, avatar_url)")
      .in("room_id", roomIds),
    orgNameMode(admin, orgId),
  ]);

  const hidden = new Set((hiddenRes.data || []).map((h) => h.message_id));
  const roomById = new Map((roomsRes.data || []).map((r) => [r.id, r]));
  const membersByRoom = new Map<string, { userId: string; name: string; avatar: string | null }[]>();
  for (const m of membersRes.data || []) {
    const p = Array.isArray(m.member) ? m.member[0] : m.member;
    const list = membersByRoom.get(m.room_id) || [];
    list.push({ userId: m.user_id, name: pickName(p, mode), avatar: p?.avatar_url ?? null });
    membersByRoom.set(m.room_id, list);
  }

  const results = (matchRes.data || [])
    .filter((m) => !hidden.has(m.id))
    .map((m) => {
      const room = roomById.get(m.room_id);
      const members = membersByRoom.get(m.room_id) || [];
      let roomName = room?.name || null;
      let roomAvatar: string | null = null;
      if (room?.type === "dm") {
        const other = members.find((x) => x.userId !== userId) || members[0];
        roomName = other?.name || "Direct message";
        roomAvatar = other?.avatar ?? null;
      }
      const sender = Array.isArray(m.sender) ? m.sender[0] : m.sender;
      return {
        messageId: m.id,
        roomId: m.room_id,
        roomName: roomName || "Conversation",
        roomAvatar,
        senderName: pickName(sender, mode),
        snippet: (m.content || "").replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1"),
        createdAt: m.created_at,
      };
    });

  return NextResponse.json({ results });
}
