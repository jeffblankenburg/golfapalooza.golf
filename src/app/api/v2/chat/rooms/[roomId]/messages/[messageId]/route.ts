import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";

/**
 * DELETE /api/v2/chat/rooms/[roomId]/messages/[messageId] — hide a message for
 * the caller only (per-user delete, like the original). Room-membership gated.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string; messageId: string }> },
) {
  const { roomId, messageId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const { data: msg } = await a.admin
    .from("v2_chat_messages")
    .select("id")
    .eq("id", messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: "Message not in room" }, { status: 404 });

  const { error } = await a.admin
    .from("v2_chat_hidden_messages")
    .upsert({ user_id: a.userId, message_id: messageId }, { onConflict: "user_id,message_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
