import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BottomNav } from "@/components/BottomNav";
import { HeaderBar } from "@/components/HeaderBar";
import { SimulatorBanner } from "@/components/SimulatorBanner";
import { MusicPlayerProvider } from "@/components/MusicPlayerProvider";
import { AppShell } from "@/components/AppShell";
import { getSimDate, getSimUserId, getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { hasAnyPermission } from "@/lib/permissions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();

  // Single users query (replaces two separate queries)
  const { data: realProfile } = await supabase
    .from("users")
    .select("is_admin, display_name, avatar_url, permissions")
    .eq("id", user.id)
    .single();

  const realIsAdmin = realProfile?.is_admin ?? false;
  const realPermissions = (realProfile?.permissions as Record<string, boolean>) ?? null;

  // Determine effective user (sim or real)
  const simulating = realIsAdmin && await isSimulating();
  const effectiveUserId = realIsAdmin
    ? await getEffectiveUserId(user.id)
    : user.id;

  // Use admin client when simulating to bypass RLS
  const queryClient = simulating ? createAdminClient() : supabase;

  // Run profile (if simulating), notifications, and chat memberships in parallel
  const [profileResult, notifResult, membershipsResult] = await Promise.all([
    simulating
      ? queryClient.from("users").select("is_admin, display_name, avatar_url, permissions").eq("id", effectiveUserId).single()
      : Promise.resolve({ data: realProfile }),
    queryClient
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", effectiveUserId)
      .eq("read", false)
      .neq("type", "chat_message"),
    queryClient
      .from("chat_room_members")
      .select("room_id")
      .eq("user_id", effectiveUserId),
  ]);

  const profile = profileResult.data;
  const isAdmin = profile?.is_admin ?? false;
  const unreadCount = (notifResult as { count: number | null }).count || 0;
  const memberships = membershipsResult.data;

  // Get unread chat count
  let chatUnreadCount = 0;
  if (memberships?.length) {
    const roomIds = memberships.map((m) => m.room_id);

    const { data: receipts } = await queryClient
      .from("chat_read_receipts")
      .select("room_id, last_read_at")
      .eq("user_id", effectiveUserId)
      .in("room_id", roomIds);

    const receiptMap = new Map(
      (receipts || []).map((r) => [r.room_id, r.last_read_at])
    );

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
    <MusicPlayerProvider>
      <AppShell>
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
        <BottomNav isAdmin={isAdmin || hasAnyPermission(simulating ? (profile?.permissions as Record<string, boolean> | null) : realPermissions)} />
      </AppShell>
    </MusicPlayerProvider>
  );
}
