import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/BottomNav";
import { HeaderBar } from "@/components/HeaderBar";

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

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin ?? false;

  // Get unread notification count
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  // TODO: Get unread chat count once chat is built
  const chatUnreadCount = 0;

  return (
    <div className="min-h-screen pb-20">
      <HeaderBar
        initialUnreadCount={unreadCount || 0}
        initialChatUnreadCount={chatUnreadCount}
        userId={user.id}
        displayName={profile?.display_name || ""}
        avatarUrl={profile?.avatar_url || null}
      />
      <main>{children}</main>
      <BottomNav isAdmin={isAdmin} />
    </div>
  );
}
