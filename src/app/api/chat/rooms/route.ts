import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

/**
 * @swagger
 * /api/chat/rooms:
 *   get:
 *     summary: List user's chat rooms with last message and unread count
 *     tags: [Chat]
 *     responses:
 *       200:
 *         description: List of chat rooms
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  // Get rooms the user is a member of
  const admin = createAdminClient();
  const { data: memberships, error: memError } = await admin
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", effectiveUserId);

  if (memError) {
    return NextResponse.json({ error: memError.message }, { status: 500 });
  }

  if (!memberships?.length) {
    return NextResponse.json({ rooms: [] });
  }

  const roomIds = memberships.map((m) => m.room_id);

  // Get rooms with members
  const { data: rooms, error: roomError } = await admin
    .from("chat_rooms")
    .select(`
      id, type, name, created_at,
      members:chat_room_members(
        user:users!chat_room_members_public_user_fk(id, display_name)
      )
    `)
    .in("id", roomIds);

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  // Get last message for each room and unread counts
  const roomsWithMeta = await Promise.all(
    (rooms || []).map(async (room) => {
      // Last message
      const { data: lastMessages } = await admin
        .from("chat_messages")
        .select("id, content, image_url, created_at, sender:users!chat_messages_sender_public_user_fk(display_name)")
        .eq("room_id", room.id)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMessage = lastMessages?.[0] || null;

      // Unread count: messages after user's last read receipt
      const { data: receipt } = await admin
        .from("chat_read_receipts")
        .select("last_read_at")
        .eq("room_id", room.id)
        .eq("user_id", effectiveUserId)
        .single();

      let unreadCount = 0;
      if (lastMessage) {
        const lastReadAt = receipt?.last_read_at || "1970-01-01T00:00:00Z";
        const { count } = await admin
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("room_id", room.id)
          .gt("created_at", lastReadAt)
          .neq("sender_id", effectiveUserId);

        unreadCount = count || 0;
      }

      // Set display name based on room type
      let displayName = room.name;
      if (room.type === "dm") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const otherMember = (room.members as any[])?.find(
          (m) => m.user?.id !== effectiveUserId
        );
        displayName = otherMember?.user?.display_name || "Direct Message";
      } else if (!displayName) {
        // Unnamed group — show member names
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const otherNames = (room.members as any[])
          ?.filter((m) => m.user?.id !== effectiveUserId)
          .map((m) => m.user?.display_name)
          .filter(Boolean);
        displayName = otherNames?.join(", ") || "Group Chat";
      }

      return {
        id: room.id,
        type: room.type,
        name: displayName,
        members: room.members,
        lastMessage,
        unreadCount,
        created_at: room.created_at,
      };
    })
  );

  // Sort: rooms with recent messages first
  roomsWithMeta.sort((a, b) => {
    const aTime = a.lastMessage?.created_at || a.created_at;
    const bTime = b.lastMessage?.created_at || b.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });

  return NextResponse.json({ rooms: roomsWithMeta });
}

/**
 * @swagger
 * /api/chat/rooms:
 *   post:
 *     summary: Create or find a conversation (DM or group)
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: User IDs to include (1 = DM, 2+ = group)
 *               name:
 *                 type: string
 *                 description: Optional group name (ignored for DMs)
 *     responses:
 *       200:
 *         description: Chat room (existing or newly created)
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  const body = await request.json();
  // Support both legacy { userId } and new { userIds } format
  const userIds: string[] = body.userIds || (body.userId ? [body.userId] : []);
  const groupName: string | undefined = body.name;

  // Filter out current user and deduplicate
  const otherUserIds = [...new Set(userIds.filter((id: string) => id !== effectiveUserId))];

  if (otherUserIds.length === 0) {
    return NextResponse.json(
      { error: "At least one other user is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const allMemberIds = [effectiveUserId, ...otherUserIds].sort();
  const isDM = otherUserIds.length === 1;

  // Find existing room with exactly these members
  // Get all rooms the current user is in
  const { data: myRooms } = await admin
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", effectiveUserId);

  if (myRooms?.length) {
    const myRoomIds = myRooms.map((r) => r.room_id);

    // For each of the current user's rooms, check if members match exactly
    const { data: candidateRooms } = await admin
      .from("chat_rooms")
      .select("id, type")
      .in("id", myRoomIds)
      .eq("type", isDM ? "dm" : "group");

    if (candidateRooms?.length) {
      for (const room of candidateRooms) {
        const { data: members } = await admin
          .from("chat_room_members")
          .select("user_id")
          .eq("room_id", room.id);

        if (members) {
          const roomMemberIds = members.map((m) => m.user_id).sort();
          if (
            roomMemberIds.length === allMemberIds.length &&
            roomMemberIds.every((id, i) => id === allMemberIds[i])
          ) {
            // Exact match found
            return NextResponse.json({ room: { id: room.id }, existing: true });
          }
        }
      }
    }
  }

  // No existing room — create a new one
  const { data: newRoom, error: roomError } = await admin
    .from("chat_rooms")
    .insert({
      type: isDM ? "dm" : "group",
      name: isDM ? null : (groupName || null),
      created_by: effectiveUserId,
    })
    .select("id")
    .single();

  if (roomError) {
    return NextResponse.json({ error: roomError.message }, { status: 500 });
  }

  // Add all members
  const { error: memberError } = await admin
    .from("chat_room_members")
    .insert(
      allMemberIds.map((uid) => ({ room_id: newRoom.id, user_id: uid }))
    );

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  return NextResponse.json({ room: { id: newRoom.id }, existing: false });
}
