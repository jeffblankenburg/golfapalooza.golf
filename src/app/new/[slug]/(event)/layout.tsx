import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import EventShell from "./EventShell";
import MusicProvider from "./MusicProvider";

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
  const [meRes, unreadRes, chatMineRes] = await Promise.all([
    supabase.from("v2_profiles").select("avatar_url").eq("id", ctx.userId).maybeSingle(),
    supabase
      .from("v2_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("org_id", org.id)
      .eq("read", false)
      .not("type", "in", "(chat_message,chat_mention)"),
    supabase.from("v2_chat_room_members").select("room_id, hidden_at").eq("user_id", ctx.userId),
  ]);

  // Initial chat unread across my rooms (bounded recent window, like the badge API).
  let initialChatUnread = 0;
  const chatRoomIds = (chatMineRes.data || []).filter((m) => !m.hidden_at).map((m) => m.room_id);
  if (chatRoomIds.length) {
    const [receipts, recent, hiddenR] = await Promise.all([
      supabase.from("v2_chat_read_receipts").select("room_id, last_read_at").eq("user_id", ctx.userId).in("room_id", chatRoomIds),
      supabase
        .from("v2_chat_messages")
        .select("id, room_id, sender_id, created_at")
        .in("room_id", chatRoomIds)
        .order("created_at", { ascending: false })
        .limit(600),
      supabase.from("v2_chat_hidden_messages").select("message_id").eq("user_id", ctx.userId),
    ]);
    const lastRead = new Map((receipts.data || []).map((r) => [r.room_id, r.last_read_at]));
    const hiddenChat = new Set((hiddenR.data || []).map((h) => h.message_id));
    for (const msg of recent.data || []) {
      if (hiddenChat.has(msg.id)) continue;
      const lr = lastRead.get(msg.room_id);
      if (msg.sender_id !== ctx.userId && (!lr || msg.created_at > lr)) initialChatUnread += 1;
    }
  }

  return (
    <MusicProvider orgId={org.id}>
      <EventShell
        slug={slug}
        orgId={org.id}
        userId={ctx.userId}
        isAdmin={isAdmin}
        orgName={org.name}
        logoUrl={org.logo_url}
        userAvatarUrl={meRes.data?.avatar_url ?? null}
        initialUnreadCount={unreadRes.count ?? 0}
        initialChatUnread={initialChatUnread}
      >
        {children}
      </EventShell>
    </MusicProvider>
  );
}
