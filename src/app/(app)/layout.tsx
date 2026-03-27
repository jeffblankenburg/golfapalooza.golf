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
    .eq("read", false);

  // TODO: Get unread chat count once chat is built
  const chatUnreadCount = 0;

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
