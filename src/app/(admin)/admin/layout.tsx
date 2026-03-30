import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/AdminNav";
import { HeaderBar } from "@/components/HeaderBar";

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
    .select("is_admin, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/");
  }

  // Get unread notification count (exclude chat_message, same as app layout)
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false)
    .neq("type", "chat_message");

  return (
    <div className="min-h-screen pb-20">
      <HeaderBar
        initialUnreadCount={unreadCount || 0}
        initialChatUnreadCount={0}
        userId={user.id}
        displayName={profile?.display_name || ""}
        avatarUrl={profile?.avatar_url || null}
      />
      <main>{children}</main>
      <AdminNav />
    </div>
  );
}
