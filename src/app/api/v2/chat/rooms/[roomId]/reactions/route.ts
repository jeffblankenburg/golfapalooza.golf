import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";

/**
 * Reactions on a message.
 *   POST   { messageId, emoji } — add (idempotent).
 *   DELETE { messageId, emoji } — remove the caller's reaction.
 * Room-membership gated; the message must belong to this room.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { messageId?: string; emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.messageId || !body.emoji) {
    return NextResponse.json({ error: "messageId and emoji required" }, { status: 400 });
  }

  const { data: msg } = await a.admin
    .from("v2_chat_messages")
    .select("id")
    .eq("id", body.messageId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (!msg) return NextResponse.json({ error: "Message not in room" }, { status: 404 });

  const { error } = await a.admin.from("v2_chat_reactions").upsert(
    { message_id: body.messageId, user_id: a.userId, emoji: body.emoji },
    { onConflict: "message_id,user_id,emoji" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { messageId?: string; emoji?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.messageId || !body.emoji) {
    return NextResponse.json({ error: "messageId and emoji required" }, { status: 400 });
  }

  const { error } = await a.admin
    .from("v2_chat_reactions")
    .delete()
    .eq("message_id", body.messageId)
    .eq("user_id", a.userId)
    .eq("emoji", body.emoji);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
