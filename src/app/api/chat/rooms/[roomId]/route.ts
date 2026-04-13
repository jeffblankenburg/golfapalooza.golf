import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

// PUT - Rename a group chat
export async function PUT(
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

  // Verify membership
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
    .select("id, type")
    .eq("id", roomId)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.type !== "group") {
    return NextResponse.json({ error: "Cannot rename a direct message" }, { status: 400 });
  }

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > 50) {
    return NextResponse.json(
      { error: "Name must be 1-50 characters" },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin
    .from("chat_rooms")
    .update({ name })
    .eq("id", roomId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ name });
}

// DELETE - Hide chat (iMessage-style) or leave group
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

  // Verify membership
  const { data: membership } = await admin
    .from("chat_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", effectiveUserId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action || "hide";

  if (action === "leave") {
    // Verify room is a group (can't leave a DM, only hide)
    const { data: room } = await admin
      .from("chat_rooms")
      .select("type")
      .eq("id", roomId)
      .single();

    if (room?.type !== "group") {
      return NextResponse.json(
        { error: "Cannot leave a direct message. Use 'hide' instead." },
        { status: 400 }
      );
    }

    // Remove membership entirely
    const { error } = await admin
      .from("chat_room_members")
      .delete()
      .eq("id", membership.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ result: "left" });
  }

  // Default: hide (set hidden_at)
  const { error } = await admin
    .from("chat_room_members")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", membership.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ result: "hidden" });
}
