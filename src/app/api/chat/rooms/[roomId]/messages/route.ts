import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBulkNotifications } from "@/lib/notifications/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/chat/rooms/{roomId}/messages:
 *   get:
 *     summary: Get messages for a chat room (paginated, newest first)
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO timestamp for cursor-based pagination
 *     responses:
 *       200:
 *         description: List of messages
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const cursor = searchParams.get("cursor");

  let query = supabase
    .from("chat_messages")
    .select(`
      id, content, image_url, reply_to_id, created_at, updated_at, sender_id,
      sender:users!chat_messages_sender_public_user_fk(id, display_name),
      reactions:chat_reactions(id, emoji, user_id)
    `)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = data || [];

  // Collect IDs we need to resolve: broken senders + reply_to messages
  const senderIdsToResolve = new Set<string>();
  const replyToIds = new Set<string>();

  for (const msg of messages) {
    if (!msg.sender && msg.sender_id) {
      senderIdsToResolve.add(msg.sender_id);
    }
    if (msg.reply_to_id) {
      replyToIds.add(msg.reply_to_id);
    }
  }

  // Fetch reply_to messages separately (no self-join)
  let replyToMap: Record<string, { id: string; content: string | null; sender_id: string }> = {};
  if (replyToIds.size > 0) {
    const { data: replyMsgs } = await supabase
      .from("chat_messages")
      .select("id, content, sender_id")
      .in("id", [...replyToIds]);
    if (replyMsgs) {
      for (const rm of replyMsgs) {
        replyToMap[rm.id] = rm;
        senderIdsToResolve.add(rm.sender_id);
      }
    }
  }

  // Batch-fetch all sender display names we need
  let senderMap: Record<string, string> = {};
  if (senderIdsToResolve.size > 0) {
    const { data: senders } = await supabase
      .from("users")
      .select("id, display_name")
      .in("id", [...senderIdsToResolve]);
    if (senders) {
      senderMap = Object.fromEntries(
        senders.map((s) => [s.id, s.display_name])
      );
    }
  }

  // Enrich messages
  const enriched = messages.map((msg) => {
    // Fix main sender if FK join failed
    const sender = msg.sender || (msg.sender_id
      ? { id: msg.sender_id, display_name: senderMap[msg.sender_id] || "Unknown" }
      : null);

    // Resolve reply_to from our manual lookup
    let reply_to = null;
    if (msg.reply_to_id && replyToMap[msg.reply_to_id]) {
      const rt = replyToMap[msg.reply_to_id];
      reply_to = {
        id: rt.id,
        content: rt.content,
        sender: { display_name: senderMap[rt.sender_id] || "Unknown" },
      };
    }

    return {
      id: msg.id,
      content: msg.content,
      image_url: msg.image_url,
      reply_to_id: msg.reply_to_id,
      created_at: msg.created_at,
      updated_at: msg.updated_at,
      sender,
      reactions: msg.reactions,
      reply_to,
    };
  });

  return NextResponse.json({ messages: enriched });
}

/**
 * @swagger
 * /api/chat/rooms/{roomId}/messages:
 *   post:
 *     summary: Send a message to a chat room
 *     tags: [Chat]
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content:
 *                 type: string
 *               imageUrl:
 *                 type: string
 *               replyToId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 *       401:
 *         description: Unauthorized
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { content, imageUrl, replyToId } = body;

  if (!content && !imageUrl) {
    return NextResponse.json(
      { error: "Message must have content or an image" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { data: message, error } = await client
    .from("chat_messages")
    .insert({
      room_id: roomId,
      sender_id: effectiveUserId,
      content: content || null,
      image_url: imageUrl || null,
      reply_to_id: replyToId || null,
    })
    .select("id, content, image_url, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send notifications to other room members
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("chat_room_members")
    .select("user_id")
    .eq("room_id", roomId)
    .neq("user_id", effectiveUserId);

  if (members?.length) {
    const { data: sender } = await admin
      .from("users")
      .select("display_name")
      .eq("id", effectiveUserId)
      .single();

    const senderName = sender?.display_name || "Someone";
    const isGif = !content && imageUrl?.includes("giphy.com");
    const preview = content
      ? content.length > 50
        ? content.slice(0, 50) + "..."
        : content
      : isGif
        ? "Sent a GIF"
        : "Sent an image";

    const otherUserIds = members.map((m) => m.user_id);
    await sendBulkNotifications(otherUserIds, {
      type: "chat_message",
      title: senderName,
      body: preview,
      data: { roomId, messageId: message.id },
    }).catch(console.error);
  }

  return NextResponse.json({ message }, { status: 201 });
}
