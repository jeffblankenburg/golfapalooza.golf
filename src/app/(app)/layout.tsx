import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BottomNav } from "@/components/BottomNav";
import { HeaderBar } from "@/components/HeaderBar";
import { SimulatorBanner } from "@/components/SimulatorBanner";
import { getSimDate, getSimUserId, getEffectiveUserId, isSimulating } from "@/lib/simulator";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if real user is admin (needed to allow simulation)
  const { data: realProfile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  const realIsAdmin = realProfile?.is_admin ?? false;

  // Determine effective user (sim or real)
  const simulating = realIsAdmin && await isSimulating();
  const effectiveUserId = realIsAdmin
    ? await getEffectiveUserId(user.id)
    : user.id;

  // Use admin client when simulating to bypass RLS
  const queryClient = simulating ? createAdminClient() : supabase;

  const { data: profile } = await queryClient
    .from("users")
    .select("is_admin, display_name, avatar_url")
    .eq("id", effectiveUserId)
    .single();

  // Show admin nav if the simulated user is also an admin
  const isAdmin = profile?.is_admin ?? false;

  // Get unread notification count for effective user
  const { count: unreadCount } = await queryClient
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", effectiveUserId)
    .eq("read", false)
    .neq("type", "chat_message");

  // Get unread chat count: messages after last read receipt, across all rooms
  let chatUnreadCount = 0;
  const { data: memberships } = await queryClient
    .from("chat_room_members")
    .select("room_id")
    .eq("user_id", effectiveUserId);

  if (memberships?.length) {
    const roomIds = memberships.map((m) => m.room_id);

    // Get all read receipts for this user
    const { data: receipts } = await queryClient
      .from("chat_read_receipts")
      .select("room_id, last_read_at")
      .eq("user_id", effectiveUserId)
      .in("room_id", roomIds);

    const receiptMap = new Map(
      (receipts || []).map((r) => [r.room_id, r.last_read_at])
    );

    // Count unread messages per room in parallel
    const counts = await Promise.all(
      roomIds.map(async (roomId) => {
        const lastReadAt = receiptMap.get(roomId) || "1970-01-01T00:00:00Z";
        const { count } = await queryClient
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("room_id", roomId)
          .gt("created_at", lastReadAt)
          .neq("sender_id", effectiveUserId);
        return count || 0;
      })
    );

    chatUnreadCount = counts.reduce((sum, c) => sum + c, 0);
  }

  // Get sim state for banner (only show to real admins)
  const simDate = realIsAdmin ? await getSimDate() : null;
  const simUserId = realIsAdmin ? await getSimUserId() : null;
  const simUserName = simulating ? (profile?.display_name || null) : null;
  const showBanner = realIsAdmin && (simDate || simUserId);

  return (
    <div className="min-h-screen pb-20">
      {showBanner && (
        <SimulatorBanner
          simDate={simDate}
          simUserName={simUserName}
        />
      )}
      <HeaderBar
        initialUnreadCount={unreadCount || 0}
        initialChatUnreadCount={chatUnreadCount}
        userId={effectiveUserId}
        displayName={profile?.display_name || ""}
        avatarUrl={profile?.avatar_url || null}
      />
      <main>{children}</main>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
