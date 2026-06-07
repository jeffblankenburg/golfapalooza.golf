import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - Fetch a room's metadata + members + the caller's display name/role.
// Mirrors the data assembled by /chat/[roomId]/page.tsx server fetch so the
// universal ChatDrawer can hydrate a room view client-side.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
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

  const { data: room } = await supabase
    .from("chat_rooms")
    .select(`
      id, type, name, created_by,
      members:chat_room_members(
        role,
        user:users!chat_room_members_public_user_fk(id, display_name, avatar_url)
      )
    `)
    .eq("id", roomId)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  type RawMember = {
    role?: string;
    user:
      | { id: string; display_name: string; avatar_url: string | null }
      | { id: string; display_name: string; avatar_url: string | null }[]
      | null;
  };
  function flatUser(m: RawMember) {
    return Array.isArray(m.user) ? m.user[0] : m.user;
  }
  const rawMembers = (room.members as RawMember[] | null) || [];
  const currentMember = rawMembers.find((m) => flatUser(m)?.id === effectiveUserId);

  // Caller must be a member to view the room.
  if (!currentMember) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const currentUserName = flatUser(currentMember)?.display_name || "You";
  const currentUserRole = currentMember.role || "member";

  // Display name resolution matches the server page logic.
  let displayName: string | null = room.name;
  if (room.type === "dm") {
    const other = rawMembers.find((m) => flatUser(m)?.id !== effectiveUserId);
    displayName = flatUser(other)?.display_name || "Direct Message";
  } else if (!displayName) {
    const otherNames = rawMembers
      .filter((m) => flatUser(m)?.id !== effectiveUserId)
      .map((m) => flatUser(m)?.display_name)
      .filter(Boolean) as string[];
    displayName = otherNames.join(", ") || "Group Chat";
  }

  const members = rawMembers
    .filter((m) => flatUser(m))
    .map((m) => {
      const u = flatUser(m)!;
      return {
        id: u.id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        role: m.role || "member",
      };
    });

  return NextResponse.json({
    room: {
      id: room.id,
      type: room.type,
      raw_name: room.name,
      display_name: displayName,
      created_by: room.created_by,
      member_count: members.length,
      current_user_id: effectiveUserId,
      current_user_name: currentUserName,
      current_user_role: currentUserRole,
      members,
    },
  });
}

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

  // Verify room is a group and not a system-managed room
  const { data: room } = await admin
    .from("chat_rooms")
    .select("id, type, created_by")
    .eq("id", roomId)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.type !== "group") {
    return NextResponse.json({ error: "Cannot rename a direct message" }, { status: 400 });
  }

  if (!room.created_by) {
    return NextResponse.json({ error: "This chat cannot be renamed" }, { status: 400 });
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
