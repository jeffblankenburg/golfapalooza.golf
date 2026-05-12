import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminNav } from "@/components/AdminNav";
import { HeaderBar } from "@/components/HeaderBar";
import { SimulatorBanner } from "@/components/SimulatorBanner";
import { hasAnyPermission } from "@/lib/permissions";
import { getSimUserId, getSimDate, getEffectiveTripId, isSimulatingTrip } from "@/lib/simulator";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, display_name, avatar_url, permissions")
    .eq("id", user.id)
    .single();

  const realIsAdmin = profile?.is_admin ?? false;
  const realPermissions = (profile?.permissions as Record<string, boolean>) ?? null;

  if (!realIsAdmin && !hasAnyPermission(realPermissions)) {
    redirect("/");
  }

  // If the real user is admin and simulating someone, use the simulated user's access
  let isAdmin = realIsAdmin;
  let permissions = realPermissions;
  const simUserId = realIsAdmin ? await getSimUserId() : null;
  const simDate = realIsAdmin ? await getSimDate() : null;
  let simUserName: string | null = null;
  let simAvatarUrl: string | null = null;

  if (simUserId && realIsAdmin) {
    const adminClient = createAdminClient();
    const { data: simProfile } = await adminClient
      .from("users")
      .select("is_admin, permissions, display_name, avatar_url")
      .eq("id", simUserId)
      .single();

    isAdmin = simProfile?.is_admin ?? false;
    permissions = (simProfile?.permissions as Record<string, boolean>) ?? null;
    simUserName = simProfile?.display_name || null;
    simAvatarUrl = simProfile?.avatar_url || null;
  }

  const simTripActive = realIsAdmin ? await isSimulatingTrip() : false;
  const showBanner = realIsAdmin && (simDate || simUserId || simTripActive);

  const effectiveUserId = simUserId || user.id;
  const effectiveDisplayName = simUserName || profile?.display_name || "";
  const effectiveAvatarUrl = simUserId ? simAvatarUrl : (profile?.avatar_url || null);

  // Get active trip for bottom nav
  const adminClient2 = createAdminClient();
  const { data: activeTrip } = await adminClient2
    .from("trip_settings")
    .select("id, trip_year")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  // Get unread notification count (exclude chat_message, same as app layout)
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false)
    .neq("type", "chat_message");

  return (
    <div className="min-h-dvh pb-20">
      {showBanner && (
        <SimulatorBanner
          simDate={simDate}
          simUserName={simUserName}
          simTripActive={simTripActive}
        />
      )}
      <HeaderBar
        initialUnreadCount={unreadCount || 0}
        initialChatUnreadCount={0}
        userId={effectiveUserId}
        displayName={effectiveDisplayName}
        avatarUrl={effectiveAvatarUrl}
      />
      <main>{children}</main>
      <AdminNav isAdmin={isAdmin} permissions={permissions} activeTripId={activeTrip?.id || null} activeTripYear={activeTrip?.trip_year || null} />
    </div>
  );
}
