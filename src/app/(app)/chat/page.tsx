import { createClient, getAuthUser } from "@/lib/supabase/server";
import { ChatRoomList } from "@/components/chat/ChatRoomList";
import { getEffectiveUserId } from "@/lib/simulator";

export default async function ChatPage() {
  const user = await getAuthUser();
  const supabase = await createClient();
  const effectiveUserId = await getEffectiveUserId(user!.id);

  // Get all users for the DM picker
  const { data: allUsers } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .eq("is_financial_only", false)
    .eq("is_active", true)
    .neq("id", effectiveUserId)
    .order("display_name");

  return (
    <ChatRoomList
      currentUserId={effectiveUserId}
      users={allUsers || []}
    />
  );
}
