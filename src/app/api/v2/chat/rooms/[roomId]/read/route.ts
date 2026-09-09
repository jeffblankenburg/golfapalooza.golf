import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";

/**
 * POST /api/v2/chat/rooms/[roomId]/read { messageId } — mark the room read up to
 * a message (upserts the caller's read receipt). Room-membership gated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { messageId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { error } = await a.admin.from("v2_chat_read_receipts").upsert(
    {
      room_id: roomId,
      user_id: a.userId,
      last_read_message_id: body.messageId || null,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "room_id,user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
