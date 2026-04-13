import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

// POST - Add members to a group chat
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const admin = createAdminClient();

  // Verify caller is a member
  const { data: membership } = await admin
    .from("chat_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", effectiveUserId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  // Verify room is a group
  const { data: room } = await admin
    .from("chat_rooms")
    .select("type")
    .eq("id", roomId)
    .single();

  if (room?.type !== "group") {
    return NextResponse.json({ error: "Can only add members to group chats" }, { status: 400 });
  }

  const body = await request.json();
  const userIds: string[] = body.userIds || [];

  if (userIds.length === 0) {
    return NextResponse.json({ error: "userIds required" }, { status: 400 });
  }

  // Insert new members (ON CONFLICT DO NOTHING for idempotency)
  const rows = userIds.map((uid) => ({
    room_id: roomId,
    user_id: uid,
    role: "member" as const,
  }));

  await admin
    .from("chat_room_members")
    .upsert(rows, { onConflict: "room_id,user_id", ignoreDuplicates: true });

  // Return updated member list
  const { data: members } = await admin
    .from("chat_room_members")
    .select("user_id, role, user:users!chat_room_members_public_user_fk(id, display_name, avatar_url)")
    .eq("room_id", roomId);

  return NextResponse.json({ members: members || [] });
}

// DELETE - Remove a member from a group chat
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const admin = createAdminClient();

  const body = await request.json();
  const targetUserId: string = body.userId;

  if (!targetUserId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  // If removing someone else, caller must be creator
  if (targetUserId !== effectiveUserId) {
    const { data: callerMembership } = await admin
      .from("chat_room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", effectiveUserId)
      .single();

    if (callerMembership?.role !== "creator") {
      return NextResponse.json(
        { error: "Only the chat creator can remove other members" },
        { status: 403 }
      );
    }
  }

  // Delete the target's membership
  const { error } = await admin
    .from("chat_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", targetUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
