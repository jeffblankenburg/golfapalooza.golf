import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatRoom } from "@/components/chat/ChatRoom";
import { getEffectiveUserId } from "@/lib/simulator";

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const effectiveUserId = await getEffectiveUserId(user.id);

  // Get room info with members
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
    redirect("/chat");
  }

  // Get current user's display name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentMember = (room.members as any[])?.find(
    (m) => m.user?.id === effectiveUserId
  );
  const currentUserName = currentMember?.user?.display_name || "You";

  // Determine display name
  let displayName = room.name;
  if (room.type === "dm") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const otherMember = (room.members as any[])?.find(
      (m) => m.user?.id !== effectiveUserId
    );
    displayName = otherMember?.user?.display_name || "Direct Message";
  } else if (!displayName) {
    // Unnamed group — show member names like iMessage
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const otherNames = (room.members as any[])
      ?.filter((m) => m.user?.id !== effectiveUserId)
      .map((m) => m.user?.display_name)
      .filter(Boolean);
    displayName = otherNames?.join(", ") || "Group Chat";
  }

  // Get current user's role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentMemberWithRole = (room.members as any[])?.find(
    (m) => m.user?.id === effectiveUserId
  );
  const currentUserRole = currentMemberWithRole?.role || "member";

  // Build members list with roles for settings
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membersList = (room.members as any[])
    ?.filter((m) => m.user)
    .map((m) => ({
      id: m.user.id,
      display_name: m.user.display_name,
      avatar_url: m.user.avatar_url,
      role: m.role || "member",
    })) || [];

  return (
    <ChatRoom
      roomId={roomId}
      roomName={displayName || "Chat"}
      rawRoomName={room.name}
      roomType={room.type}
      currentUserId={effectiveUserId}
      currentUserName={currentUserName}
      memberCount={room.members?.length || 0}
      currentUserRole={currentUserRole}
      createdBy={room.created_by}
      members={membersList}
    />
  );
}
