import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * GET /api/v2/chat/unread?orgId= — total unread chat messages across the caller's
 * rooms (for the top-nav chat badge). Auth: bearer/cookie; org-membership gated.
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

  const { data: mine } = await admin
    .from("v2_chat_room_members")
    .select("room_id, hidden_at")
    .eq("user_id", userId);
  const roomIds = (mine || []).filter((m) => !m.hidden_at).map((m) => m.room_id);
  if (roomIds.length === 0) return NextResponse.json({ unread: 0 });

  const [receiptsRes, recentRes, hiddenRes] = await Promise.all([
    admin.from("v2_chat_read_receipts").select("room_id, last_read_at").eq("user_id", userId).in("room_id", roomIds),
    admin
      .from("v2_chat_messages")
      .select("id, room_id, sender_id, created_at")
      .in("room_id", roomIds)
      .order("created_at", { ascending: false })
      .limit(600),
    admin.from("v2_chat_hidden_messages").select("message_id").eq("user_id", userId),
  ]);
  const lastRead = new Map((receiptsRes.data || []).map((r) => [r.room_id, r.last_read_at]));
  const hidden = new Set((hiddenRes.data || []).map((h) => h.message_id));

  let unread = 0;
  for (const msg of recentRes.data || []) {
    if (hidden.has(msg.id)) continue;
    const lr = lastRead.get(msg.room_id);
    if (msg.sender_id !== userId && (!lr || msg.created_at > lr)) unread += 1;
  }
  return NextResponse.json({ unread });
}
