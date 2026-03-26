import { createClient } from "@/lib/supabase/server";
import { ChatRoomList } from "@/components/chat/ChatRoomList";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get all users for the DM picker
  const { data: allUsers } = await supabase
    .from("users")
    .select("id, display_name")
    .eq("is_active", true)
    .neq("id", user!.id)
    .order("display_name");

  return (
    <ChatRoomList
      currentUserId={user!.id}
      users={allUsers || []}
    />
  );
}
