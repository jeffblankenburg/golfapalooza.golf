import { NextResponse } from "next/server";
import { resolveRoomAccess } from "@/lib/v2/chat";
import { sendV2Notifications } from "@/lib/v2/notifications";
import { orgSlug, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * Messages for a room.
 *   GET  ?before=<ISO>&limit=  — newest-first page; `before` pages BACK through
 *        the full history (lazy scrollback). Returns nextCursor (oldest in page)
 *        + hasMore. Excludes the caller's hidden messages.
 *   POST { content?, imageUrl?, replyToId? } — send; unhides the room for all
 *        members and notifies the others (chat_message).
 * Auth: bearer (native) or cookie (web); room-membership gated.
 */

const PAGE = 30;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const url = new URL(request.url);
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const around = url.searchParams.get("around");
  const limit = Math.min(Number(url.searchParams.get("limit")) || PAGE, 100);

  const SELECT =
    "id, room_id, sender_id, content, image_url, reply_to_id, created_at, sender:v2_profiles!v2_chat_messages_sender_id_fkey(display_name, first_name, last_name, avatar_url), reactions:v2_chat_reactions(emoji, user_id)";

  const hiddenRes = await a.admin
    .from("v2_chat_hidden_messages")
    .select("message_id")
    .eq("user_id", a.userId);
  const hidden = new Set((hiddenRes.data || []).map((h) => h.message_id));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any[] = [];
  let nextCursor: string | null = null; // older
  let newerCursor: string | null = null; // newer
  let hasMore = false; // older exist
  let hasNewer = false; // newer exist
  let newerCount = 0; // how many messages are newer than the target (around mode)

  if (around) {
    // Load a window centered on a target message (for deep-linking from search).
    const { data: target } = await a.admin
      .from("v2_chat_messages")
      .select("created_at")
      .eq("id", around)
      .eq("room_id", roomId)
      .maybeSingle();
    const at = target?.created_at ?? new Date().toISOString();
    const HALF = 25;
    const [olderRes, newerRes, newerCountRes] = await Promise.all([
      a.admin.from("v2_chat_messages").select(SELECT).eq("room_id", roomId).lte("created_at", at).order("created_at", { ascending: false }).limit(HALF + 1),
      a.admin.from("v2_chat_messages").select(SELECT).eq("room_id", roomId).gt("created_at", at).order("created_at", { ascending: true }).limit(HALF + 1),
      a.admin.from("v2_chat_messages").select("id", { count: "exact", head: true }).eq("room_id", roomId).gt("created_at", at),
    ]);
    const older = (olderRes.data || []).filter((m) => !hidden.has(m.id));
    const newer = (newerRes.data || []).filter((m) => !hidden.has(m.id));
    hasMore = older.length > HALF;
    hasNewer = newer.length > HALF;
    newerCount = newerCountRes.count ?? 0;
    const olderPage = hasMore ? older.slice(0, HALF) : older;
    const newerPage = hasNewer ? newer.slice(0, HALF) : newer;
    page = [...olderPage.slice().reverse(), ...newerPage]; // ascending
    nextCursor = page.length ? page[0].created_at : null;
    newerCursor = page.length ? page[page.length - 1].created_at : null;
  } else if (after) {
    // Forward pagination (scrolling down toward newer, after an "around" load).
    const res = await a.admin.from("v2_chat_messages").select(SELECT).eq("room_id", roomId).gt("created_at", after).order("created_at", { ascending: true }).limit(limit + 1);
    const rows = (res.data || []).filter((m) => !hidden.has(m.id));
    hasNewer = rows.length > limit;
    page = hasNewer ? rows.slice(0, limit) : rows;
    newerCursor = page.length ? page[page.length - 1].created_at : after;
  } else {
    // Newest page, or older via `before`.
    let q = a.admin.from("v2_chat_messages").select(SELECT).eq("room_id", roomId).order("created_at", { ascending: false }).limit(limit + 1);
    if (before) q = q.lt("created_at", before);
    const res = await q;
    const rows = (res.data || []).filter((m) => !hidden.has(m.id));
    hasMore = rows.length > limit;
    const p = hasMore ? rows.slice(0, limit) : rows;
    nextCursor = hasMore ? p[p.length - 1].created_at : null;
    page = p.slice().reverse(); // ascending
  }

  // Resolve reply parents (self-referential embeds are direction-ambiguous).
  const parentIds = [...new Set(page.map((m) => m.reply_to_id).filter(Boolean))] as string[];
  if (parentIds.length) {
    const { data: parents } = await a.admin
      .from("v2_chat_messages")
      .select("id, content, image_url, sender:v2_profiles!v2_chat_messages_sender_id_fkey(display_name, first_name, last_name)")
      .in("id", parentIds);
    const byId = new Map((parents || []).map((p) => [p.id, p]));
    for (const m of page) if (m.reply_to_id) m.reply_to = byId.get(m.reply_to_id) ?? null;
  }

  return NextResponse.json({ messages: page, nextCursor, newerCursor, hasMore, hasNewer, newerCount });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const { roomId } = await params;
  const a = await resolveRoomAccess(request, roomId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { content?: string; imageUrl?: string; replyToId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const content = (body.content || "").trim() || null;
  const imageUrl = body.imageUrl || null;
  if (!content && !imageUrl) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  const { data: msg, error } = await a.admin
    .from("v2_chat_messages")
    .insert({
      room_id: roomId,
      sender_id: a.userId,
      content,
      image_url: imageUrl,
      reply_to_id: body.replyToId || null,
    })
    .select(
      "id, room_id, sender_id, content, image_url, reply_to_id, created_at, sender:v2_profiles!v2_chat_messages_sender_id_fkey(display_name, first_name, last_name, avatar_url)",
    )
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Un-hide the room for everyone (a new message resurfaces it) + notify others.
  const { data: members } = await a.admin
    .from("v2_chat_room_members")
    .select("user_id")
    .eq("room_id", roomId);
  const others = (members || []).map((m) => m.user_id).filter((id) => id !== a.userId);

  await a.admin
    .from("v2_chat_room_members")
    .update({ hidden_at: null })
    .eq("room_id", roomId)
    .not("hidden_at", "is", null);

  if (others.length) {
    const sender = Array.isArray(msg?.sender) ? msg?.sender[0] : msg?.sender;
    const senderName = pickName(sender, await orgNameMode(a.admin, a.room.org_id), "Someone");
    // Strip mention markup for the preview: "@[Name](id)" → "@Name".
    const clean = content ? content.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1") : "";
    const preview = clean ? clean.slice(0, 80) : "📷 Photo";
    // Deep-link to the org home with a query param that opens the chat drawer to
    // this room (chat is a drawer, not a route). Slug-based so the URL resolves.
    const slug = await orgSlug(a.admin, a.room.org_id);
    const link = {
      url: slug ? `/new/${slug}?open=chat&room=${roomId}` : `/new`,
      roomId,
    };

    // Mentioned users get chat_mention; everyone else chat_message.
    const mentioned = new Set<string>();
    if (content) {
      for (const m of content.matchAll(/@\[[^\]]+\]\(([^)]+)\)/g)) mentioned.add(m[1]);
    }
    const mentionedOthers = others.filter((id) => mentioned.has(id));
    const plainOthers = others.filter((id) => !mentioned.has(id));

    await Promise.all([
      mentionedOthers.length
        ? sendV2Notifications(a.admin, mentionedOthers, {
            orgId: a.room.org_id,
            type: "chat_mention",
            title: a.room.name || senderName,
            body: `${senderName} mentioned you: ${preview}`,
            data: link,
          })
        : Promise.resolve(),
      plainOthers.length
        ? sendV2Notifications(a.admin, plainOthers, {
            orgId: a.room.org_id,
            type: "chat_message",
            title: a.room.name || senderName,
            body: `${senderName}: ${preview}`,
            data: link,
          })
        : Promise.resolve(),
    ]).catch(() => {});
  }

  return NextResponse.json({ message: msg });
}
