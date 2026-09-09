import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import EventShell from "./EventShell";

/**
 * Wraps the member-facing event experience in the fixed top-bar/bottom-nav shell.
 * Scoped to the (event) route group so /new/[slug]/admin/* does NOT get the shell.
 */
export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  const isAdmin = org.role === "owner" || org.role === "admin";

  const supabase = await v2ServerClient();
  const [meRes, unreadRes] = await Promise.all([
    supabase.from("v2_profiles").select("avatar_url").eq("id", ctx.userId).maybeSingle(),
    supabase
      .from("v2_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("org_id", org.id)
      .eq("read", false)
      .not("type", "in", "(chat_message,chat_mention)"),
  ]);

  return (
    <EventShell
      slug={slug}
      orgId={org.id}
      userId={ctx.userId}
      isAdmin={isAdmin}
      orgName={org.name}
      logoUrl={org.logo_url}
      userAvatarUrl={meRes.data?.avatar_url ?? null}
      initialUnreadCount={unreadRes.count ?? 0}
    >
      {children}
    </EventShell>
  );
}
