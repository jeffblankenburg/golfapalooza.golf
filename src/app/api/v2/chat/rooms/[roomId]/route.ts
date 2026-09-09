import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";

/**
 * GET /api/v2/chat/rooms/[roomId] — room metadata + members (used for @-mention
 * autocomplete and the room header). Room-membership gated.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const { data } = await a.admin
    .from("v2_chat_room_members")
    .select("user_id, member:v2_profiles(display_name, avatar_url)")
    .eq("room_id", roomId);

  const members = (data || []).map((m) => {
    const p = Array.isArray(m.member) ? m.member[0] : m.member;
    return {
      userId: m.user_id as string,
      displayName: (p?.display_name as string) || "Member",
      avatarUrl: (p?.avatar_url as string | null) ?? null,
    };
  });

  return NextResponse.json({ room: a.room, members });
}
