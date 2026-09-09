import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the caller for a chat-room request: authenticate (bearer or cookie),
 * confirm they're a member of the room, and return an admin client + the room.
 * Server routes use the admin client after this gate (RLS is defense-in-depth +
 * realtime scoping).
 */
export interface RoomAccess {
  admin: SupabaseClient;
  userId: string;
  room: { id: string; org_id: string; type: string; name: string | null };
}

export async function resolveRoomAccess(
  request: Request,
  roomId: string,
): Promise<RoomAccess | { error: string; status: 401 | 403 | 404 }> {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 };

  const admin = v2AdminClient();
  const { data: room } = await admin
    .from("v2_chat_rooms")
    .select("id, org_id, type, name")
    .eq("id", roomId)
    .maybeSingle();
  if (!room) return { error: "Room not found", status: 404 };

  const { data: membership } = await admin
    .from("v2_chat_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) return { error: "Not a member of this room", status: 403 };

  return { admin, userId, room };
}
