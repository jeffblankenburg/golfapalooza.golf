import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasAnyPermission } from "@/lib/permissions";

// Chrome-less route group: no HeaderBar / AdminNav / BottomNav. Used by
// full-screen admin tools (e.g. the walk-up player) that own the whole
// viewport and provide their own close button. Auth is still enforced here.
export default async function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, permissions")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin ?? false;
  const permissions = (profile?.permissions as Record<string, boolean>) ?? null;

  if (!isAdmin && !hasAnyPermission(permissions)) {
    redirect("/");
  }

  return <div className="min-h-dvh bg-white">{children}</div>;
}
