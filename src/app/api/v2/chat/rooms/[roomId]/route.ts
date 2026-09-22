import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

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

  const [{ data }, mode] = await Promise.all([
    a.admin
      .from("v2_chat_room_members")
      .select("user_id, role, member:v2_profiles(display_name, first_name, last_name, nickname, avatar_url)")
      .eq("room_id", roomId),
    orgNameMode(a.admin, a.room.org_id),
  ]);

  const members = (data || []).map((m) => {
    const p = Array.isArray(m.member) ? m.member[0] : m.member;
    // Searchable across every name part (real + nickname) even though the UI
    // shows only pickName(p, mode) — the org's default naming.
    const search = [p?.display_name, p?.first_name, p?.last_name, p?.nickname]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return {
      userId: m.user_id as string,
      role: (m.role as string) ?? "member",
      displayName: pickName(p, mode),
      avatarUrl: (p?.avatar_url as string | null) ?? null,
      search,
    };
  });

  return NextResponse.json({ room: a.room, members });
}

/**
 * PUT /api/v2/chat/rooms/[roomId] — rename a group room (1–50 chars). Any member
 * may rename; DMs can't be renamed (name is derived from the other person).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (a.room.room_kind !== "regular") {
    return NextResponse.json({ error: "This channel is managed automatically and can't be renamed" }, { status: 400 });
  }
  if (a.room.type !== "group") {
    return NextResponse.json({ error: "Only group chats can be renamed" }, { status: 400 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
  if (name.length > 50) return NextResponse.json({ error: "Name is too long (50 max)" }, { status: 400 });

  const { error } = await a.admin.from("v2_chat_rooms").update({ name }).eq("id", roomId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}

/**
 * DELETE /api/v2/chat/rooms/[roomId] — leave a group chat (removes your
 * membership). DMs can't be left (hide them instead). If you were the last member
 * the room is left orphaned (its history is preserved but unreachable).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (a.room.room_kind !== "regular") {
    return NextResponse.json({ error: "This channel is managed automatically and can't be left" }, { status: 400 });
  }
  if (a.room.type !== "group") {
    return NextResponse.json({ error: "You can't leave a direct message" }, { status: 400 });
  }

  const { error } = await a.admin
    .from("v2_chat_room_members")
    .delete()
    .eq("room_id", roomId)
    .eq("user_id", a.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
