import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import EventShell from "./EventShell";
import { buildEventNav, isFeatureVisible, resolveFeatures, type FeatureRow } from "@/lib/v2/features";

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
  // Carry the group so the login screen brands to the group they were headed to.
  if (!ctx) redirect(`/new/signup?org=${encodeURIComponent(slug)}`);
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  const isAdmin = org.role === "owner" || org.role === "admin";

  const supabase = await v2ServerClient();
  const [meRes, unreadRes, chatMineRes, activeEventRes] = await Promise.all([
    supabase.from("v2_profiles").select("avatar_url").eq("id", ctx.userId).maybeSingle(),
    supabase
      .from("v2_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId)
      .eq("org_id", org.id)
      .eq("read", false)
      .not("type", "in", "(chat_message,chat_mention)"),
    supabase.from("v2_chat_room_members").select("room_id, hidden_at").eq("user_id", ctx.userId),
    supabase
      .from("v2_events")
      .select("id")
      .eq("org_id", org.id)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Resolve the feature registry into the shell nav (bottom-bar pins + "Everything"
  // launcher) and Music visibility. Group-wide features (Articles, Music…) apply
  // even with no active event; event overrides layer on when one exists. Degrades
  // to empty nav / Music-on if the registry table isn't present yet (data null).
  let pinned: ReturnType<typeof buildEventNav>["pinned"] = [];
  let launcher: ReturnType<typeof buildEventNav>["launcher"] = [];
  let musicEnabled = true;
  let chatEnabled = true;
  let photosEnabled = true;
  const activeEventId = (activeEventRes.data?.id as string | undefined) ?? null;
  const featFilter = activeEventId
    ? `event_id.is.null,event_id.eq.${activeEventId}`
    : "event_id.is.null";
  const { data: featRows } = await supabase
    .from("v2_event_features")
    .select(
      "feature_key, event_id, visibility, pinned, nav_order, label_override, public, availability, available_from, available_until",
    )
    .eq("org_id", org.id)
    .or(featFilter);
  const resolved = resolveFeatures((featRows as FeatureRow[] | null) ?? [], activeEventId ?? "");
  ({ pinned, launcher } = buildEventNav(slug, resolved, isAdmin));
  musicEnabled = isFeatureVisible(resolved, "music", isAdmin);
  chatEnabled = isFeatureVisible(resolved, "chat", isAdmin);
  photosEnabled = isFeatureVisible(resolved, "photos", isAdmin);

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

  // NameMode + Music providers now live in the parent [slug] layout so audio
  // persists across the whole org (incl. the full-screen scorer). This layout
  // just mounts the event shell.
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
      initialChatUnread={initialChatUnread}
      pinned={pinned}
      launcher={launcher}
      musicEnabled={musicEnabled}
      chatEnabled={chatEnabled}
      photosEnabled={photosEnabled}
    >
      {children}
    </EventShell>
  );
}
