import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";

/**
 * POST /api/v2/chat/rooms/[roomId]/pin { pinned } — pin/unpin the room for the
 * caller (their membership row). Room-membership gated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { pinned?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { error } = await a.admin
    .from("v2_chat_room_members")
    .update({ is_pinned: !!body.pinned })
    .eq("room_id", roomId)
    .eq("user_id", a.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pinned: !!body.pinned });
}
