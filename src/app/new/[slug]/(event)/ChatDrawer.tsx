"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
import { useNameMode } from "./NameMode";
import { pickName } from "@/lib/v2/profile";
import ImageLightbox from "./ImageLightbox";
import styles from "./chat.module.css";
/* eslint-disable @next/next/no-img-element */

interface Sender {
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url: string | null;
}
interface Reaction {
  emoji: string;
  user_id: string;
}
interface Msg {
  id: string;
  room_id: string;
  sender_id: string;
  content: string | null;
  image_url: string | null;
  reply_to_id: string | null;
  created_at: string;
  sender?: Sender | Sender[] | null;
  reactions?: Reaction[];
  reply_to?: {
    content: string | null;
    image_url: string | null;
    sender?: Sender | Sender[] | null;
  } | null;
  pending?: boolean;
}
interface Member {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}
interface RoomSummary {
  id: string;
  type: string;
  name: string | null;
  avatarUrl: string | null;
  isPinned: boolean;
  unread: number;
  members: Member[];
  lastMessage: { content: string | null; imageUrl: string | null; createdAt: string } | null;
}

const TAPBACKS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😴", "😭",
  "😅", "😉", "🙃", "😳", "🥳", "😤", "😩", "🤯", "🤠", "🥴",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤙", "🤝", "✌️", "🤞",
  "❤️", "🔥", "💯", "🎉", "⛳", "🏌️", "🍺", "🥃", "🌭", "💰",
];
const one = (s: Msg["sender"]): Sender | null => (Array.isArray(s) ? s[0] ?? null : s ?? null);
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Room-list stamp: today → time; <7 days → weekday; older → MM/DD/YYYY.
function roomStamp(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  if (now.getTime() - d.getTime() < 7 * 86400000) {
    return d.toLocaleDateString("en-US", { weekday: "short" });
  }
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

const MENTION_OR_URL = /@\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+)/g;
function renderContent(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  MENTION_OR_URL.lastIndex = 0;
  while ((m = MENTION_OR_URL.exec(content)) !== null) {
    if (m.index > last) nodes.push(content.slice(last, m.index));
    if (m[1]) {
      nodes.push(<span key={key++} className={styles.mention}>@{m[1]}</span>);
    } else if (m[3]) {
      nodes.push(
        <a key={key++} className={styles.link} href={m[3]} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {m[3]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) nodes.push(content.slice(last));
  return nodes;
}

export default function ChatDrawer({
  orgId,
  userId,
  initialRoom,
}: {
  orgId: string;
  userId: string;
  initialRoom?: string;
}) {
  // A deep-link (notification tap) can open straight into a room; otherwise the
  // room list shows first. Seeded once on mount.
  const [openRoom, setOpenRoom] = useState<{ roomId: string; target: string | null } | null>(
    initialRoom ? { roomId: initialRoom, target: null } : null,
  );
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (openRoom !== null || composing) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/chat/rooms?orgId=${orgId}`);
        const d = res.ok ? await res.json() : { rooms: [] };
        if (!cancelled) setRooms(d.rooms || []);
      } catch {
        if (!cancelled) setRooms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openRoom, composing, orgId]);

  if (composing) {
    return (
      <NewChat
        orgId={orgId}
        onCancel={() => setComposing(false)}
        onCreated={(id) => {
          setComposing(false);
          setOpenRoom({ roomId: id, target: null });
        }}
      />
    );
  }
  if (openRoom) {
    const room = rooms?.find((r) => r.id === openRoom.roomId) || null;
    return (
      <Room
        key={`${openRoom.roomId}:${openRoom.target || ""}`}
        roomId={openRoom.roomId}
        target={openRoom.target}
        room={room}
        userId={userId}
        onBack={() => setOpenRoom(null)}
      />
    );
  }
  return (
    <RoomList
      rooms={rooms}
      onOpen={(id, target) => setOpenRoom({ roomId: id, target: target ?? null })}
      onNew={() => setComposing(true)}
      orgId={orgId}
    />
  );
}

/* ── New conversation ─────────────────────────────────────────────────────── */
function NewChat({
  orgId,
  onCancel,
  onCreated,
}: {
  orgId: string;
  onCancel: () => void;
  onCreated: (roomId: string) => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/chat/members?orgId=${orgId}`);
        const d = res.ok ? await res.json() : { members: [] };
        if (!cancelled) setMembers(d.members || []);
      } catch {
        if (!cancelled) setMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function start() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    const ids = [...selected];
    const type = ids.length > 1 ? "group" : "dm";
    try {
      const res = await fetch(`/api/v2/chat/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, type, name: name.trim() || undefined, memberIds: ids }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      onCreated(d.room.id);
    } catch {
      setBusy(false);
    }
  }

  const filtered = (members || []).filter((m) => m.displayName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className={styles.newChat}>
      <div className={styles.newHeader}>
        <button type="button" className={styles.backBtn} onClick={onCancel} aria-label="Cancel">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className={styles.roomHeaderName}>New message</span>
        <button type="button" className={styles.startBtn} onClick={start} disabled={selected.size === 0 || busy}>
          {busy ? "…" : "Start"}
        </button>
      </div>
      {selected.size > 1 && (
        <input className={styles.gifSearch} value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name (optional)" />
      )}
      <input className={styles.gifSearch} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" />
      <div className={styles.memberList}>
        {members === null ? (
          <p className={styles.loading}>Loading…</p>
        ) : (
          filtered.map((m) => (
            <button key={m.userId} type="button" className={styles.memberRow} data-on={selected.has(m.userId) || undefined} onClick={() => toggle(m.userId)}>
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className={styles.mentionAvatar} />
              ) : (
                <span className={styles.mentionAvatarFallback}>{m.displayName.charAt(0).toUpperCase()}</span>
              )}
              <span>{m.displayName}</span>
              {selected.has(m.userId) && <span className={styles.memberCheck} aria-hidden>✓</span>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Room list ────────────────────────────────────────────────────────────── */
interface SearchResult {
  messageId: string;
  roomId: string;
  roomName: string;
  roomAvatar: string | null;
  senderName: string;
  snippet: string;
  createdAt: string;
}

function highlight(text: string, q: string): React.ReactNode {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span className={styles.hl}>{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

function RoomList({
  rooms,
  onOpen,
  onNew,
  orgId,
}: {
  rooms: RoomSummary[] | null;
  onOpen: (id: string, target?: string) => void;
  onNew: () => void;
  orgId: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: SearchResult[] } | null>(null);
  const query = q.trim();
  const searching = query.length >= 2;
  // Only treat results as current when they match the active query (else "Searching…").
  const current = results && results.q === query ? results.items : null;

  // Debounced message-content search.
  useEffect(() => {
    if (query.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v2/chat/search?orgId=${orgId}&q=${encodeURIComponent(query)}`);
        const d = res.ok ? await res.json() : { results: [] };
        if (!cancelled) setResults({ q: query, items: d.results || [] });
      } catch {
        if (!cancelled) setResults({ q: query, items: [] });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, orgId]);

  return (
    <div className={styles.roomListWrap}>
      {searching ? (
        current === null ? (
          <p className={styles.loading}>Searching…</p>
        ) : current.length === 0 ? (
          <p className={styles.loading}>No messages found.</p>
        ) : (
          <div className={styles.roomList}>
            {current.map((r) => (
              <button key={r.messageId} className={styles.roomRow} onClick={() => onOpen(r.roomId, r.messageId)}>
                {r.roomAvatar ? (
                  <img src={r.roomAvatar} alt="" className={styles.roomAvatar} />
                ) : (
                  <span className={styles.roomAvatarFallback}>{r.roomName.charAt(0).toUpperCase()}</span>
                )}
                <span className={styles.roomMeta}>
                  <span className={styles.roomName}>{r.roomName}</span>
                  <span className={styles.roomPreview}>
                    <span className={styles.searchSender}>{r.senderName}: </span>
                    {highlight(r.snippet, query)}
                  </span>
                </span>
                <span className={styles.roomRight}>
                  <span className={styles.roomTime}>{roomStamp(r.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        )
      ) : rooms === null ? (
        <p className={styles.loading}>Loading…</p>
      ) : rooms.length === 0 ? (
        <p className={styles.loading}>No conversations yet.</p>
      ) : (
        <div className={styles.roomList}>
          {rooms.map((r) => {
            const preview = r.lastMessage
              ? r.lastMessage.content || (r.lastMessage.imageUrl ? "📷 Photo" : "")
              : "";
            return (
              <button key={r.id} className={styles.roomRow} onClick={() => onOpen(r.id)}>
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt="" className={styles.roomAvatar} />
                ) : (
                  <span className={styles.roomAvatarFallback}>{(r.name || "?").charAt(0).toUpperCase()}</span>
                )}
                <span className={styles.roomMeta}>
                  <span className={styles.roomName}>
                    {r.isPinned && <span className={styles.pin} aria-hidden>📌 </span>}
                    {r.name || "Conversation"}
                  </span>
                  <span className={styles.roomPreview}>{preview}</span>
                </span>
                <span className={styles.roomRight}>
                  {r.lastMessage && <span className={styles.roomTime}>{roomStamp(r.lastMessage.createdAt)}</span>}
                  {r.unread > 0 && <span className={styles.roomUnread}>{r.unread > 99 ? "99+" : r.unread}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom bar: search message content + compose (iMessage-inspired). */}
      <div className={styles.listBar}>
        <div className={styles.searchWrap}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            className={styles.searchInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search messages"
          />
          {q && (
            <button type="button" className={styles.searchClear} onClick={() => setQ("")} aria-label="Clear search">
              ×
            </button>
          )}
        </div>
        <button type="button" className={styles.composeBtn} onClick={onNew} aria-label="New message">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Room view ────────────────────────────────────────────────────────────── */
function Room({
  roomId,
  room,
  userId,
  target,
  onBack,
}: {
  roomId: string;
  room: RoomSummary | null;
  userId: string;
  target: string | null;
  onBack: () => void;
}) {
  const mode = useNameMode();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newerCursor, setNewerCursor] = useState<string | null>(null);
  const [hasNewer, setHasNewer] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const [farBack, setFarBack] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pinned, setPinned] = useState(!!room?.isPinned);
  const [panel, setPanel] = useState<"menu" | "emoji" | "gif" | null>(null);
  const [gifQuery, setGifQuery] = useState("");
  const [gifs, setGifs] = useState<{ id: string; url: string }[]>([]);
  const [members, setMembers] = useState<Member[]>(room?.members || []);
  const [tapbackFor, setTapbackFor] = useState<string | null>(null);
  const [reactionDetail, setReactionDetail] = useState<{ messageId: string; emoji: string } | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [staged, setStaged] = useState<{ file: File; preview: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ id: string; src: string } | null>(null);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const longPress = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const restore = useRef<number | null>(null);
  const hasNewerRef = useRef(false);
  const scrolledToTarget = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mentionMap = useRef<Map<string, string>>(new Map()); // "@Name" -> userId
  const supabaseRef = useRef(v2BrowserClient());
  const typingChan = useRef<ReturnType<ReturnType<typeof v2BrowserClient>["channel"]> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myName = members.find((m) => m.userId === userId)?.displayName || "You";

  const markRead = useCallback(
    (lastId: string) => {
      fetch(`/api/v2/chat/rooms/${roomId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: lastId }),
      }).catch(() => {});
    },
    [roomId],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const loadLatest = useCallback(async () => {
    const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages`);
    const d = res.ok ? await res.json() : { messages: [], hasMore: false, nextCursor: null };
    setMessages(d.messages || []);
    setHasMore(!!d.hasMore);
    setCursor(d.nextCursor);
    setHasNewer(false);
    hasNewerRef.current = false;
    setNewerCursor(null);
    const last = d.messages?.[d.messages.length - 1];
    if (last) markRead(last.id);
  }, [roomId, markRead]);

  // Initial load (around a target message when deep-linked, else newest) + members.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const msgUrl = target
          ? `/api/v2/chat/rooms/${roomId}/messages?around=${encodeURIComponent(target)}`
          : `/api/v2/chat/rooms/${roomId}/messages`;
        const [msgRes, roomRes] = await Promise.all([
          fetch(msgUrl),
          fetch(`/api/v2/chat/rooms/${roomId}`),
        ]);
        const d = msgRes.ok ? await msgRes.json() : { messages: [], hasMore: false, nextCursor: null };
        const rd = roomRes.ok ? await roomRes.json() : { members: [] };
        if (cancelled) return;
        setMessages(d.messages || []);
        setHasMore(!!d.hasMore);
        setCursor(d.nextCursor);
        setHasNewer(!!d.hasNewer);
        hasNewerRef.current = !!d.hasNewer;
        setNewerCursor(d.newerCursor ?? null);
        setFarBack((d.newerCount ?? 0) > 100);
        if (rd.members?.length) setMembers(rd.members);
        setReady(true);
        const last = d.messages?.[d.messages.length - 1];
        if (last && !target) markRead(last.id);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, target, markRead]);

  // Position on first render: scroll to the target message (deep-link) or bottom.
  useLayoutEffect(() => {
    if (!ready || restore.current !== null) return;
    if (target && !scrolledToTarget.current) {
      const el = scrollRef.current?.querySelector(`[data-mid="${target}"]`) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center" });
        scrolledToTarget.current = true;
        setHighlightId(target);
        setTimeout(() => setHighlightId(null), 2200);
        return;
      }
    }
    if (!target) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Merge an incoming message (dedupe + replace optimistic temp).
  const mergeIncoming = useCallback((incoming: Msg) => {
    setMessages((cur) => {
      if (cur.some((m) => m.id === incoming.id)) return cur;
      const tempIdx = cur.findIndex(
        (m) => m.pending && m.sender_id === incoming.sender_id && m.content === incoming.content,
      );
      if (tempIdx >= 0) {
        const copy = cur.slice();
        copy[tempIdx] = incoming;
        return copy;
      }
      return [...cur, incoming];
    });
  }, []);

  // Realtime: messages + reactions.
  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      // Ensure the realtime socket carries the user's JWT, or RLS-gated
      // postgres_changes deliver nothing (the socket would join as anon).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
      .channel(`v2-chat-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "v2_chat_messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          // If we're viewing an older window (deep-linked), don't append newer
          // messages out of order — they load when the user scrolls down.
          if (hasNewerRef.current) return;
          const row = payload.new as Msg;
          if (!row.sender) {
            const { data } = await supabase
              .from("v2_profiles")
              .select("display_name, first_name, last_name, avatar_url")
              .eq("id", row.sender_id)
              .maybeSingle();
            row.sender = data as Sender | null;
          }
          const el = scrollRef.current;
          const nearBottom = el ? el.scrollHeight - el.scrollTop - el.clientHeight < 120 : true;
          mergeIncoming(row);
          if (row.sender_id !== userId) markRead(row.id);
          if (nearBottom) requestAnimationFrame(() => scrollToBottom("smooth"));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "v2_chat_reactions" },
        (payload) => {
          const r = payload.new as Reaction & { message_id: string };
          setMessages((cur) =>
            cur.map((m) =>
              m.id === r.message_id
                ? {
                    ...m,
                    reactions: (m.reactions || []).some((x) => x.emoji === r.emoji && x.user_id === r.user_id)
                      ? m.reactions
                      : [...(m.reactions || []), { emoji: r.emoji, user_id: r.user_id }],
                  }
                : m,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "v2_chat_reactions" },
        (payload) => {
          const r = payload.old as Reaction & { message_id: string };
          setMessages((cur) =>
            cur.map((m) =>
              m.id === r.message_id
                ? { ...m, reactions: (m.reactions || []).filter((x) => !(x.emoji === r.emoji && x.user_id === r.user_id)) }
                : m,
            ),
          );
        },
      )
      .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomId, userId, mergeIncoming, markRead, scrollToBottom]);

  // Typing presence.
  useEffect(() => {
    const supabase = supabaseRef.current;
    let cancelled = false;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      ch = supabase.channel(`v2-chat-typing-${roomId}`, { config: { presence: { key: userId } } });
      ch.on("presence", { event: "sync" }, () => {
        const state = ch!.presenceState() as Record<string, { typing?: boolean; name?: string }[]>;
        const names: string[] = [];
        for (const [key, metas] of Object.entries(state)) {
          if (key === userId) continue;
          const meta = metas[0];
          if (meta?.typing && meta.name) names.push(meta.name);
        }
        setTyping(names);
      }).subscribe();
      typingChan.current = ch;
    })();
    return () => {
      cancelled = true;
      if (ch) supabase.removeChannel(ch);
      typingChan.current = null;
    };
  }, [roomId, userId]);

  function signalTyping() {
    const ch = typingChan.current;
    if (!ch) return;
    ch.track({ typing: true, name: myName });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => ch.track({ typing: false, name: myName }), 3000);
  }

  // Resync on refocus/reconnect.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "visible") loadLatest();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
    };
  }, [loadLatest]);

  async function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // Older messages when near the top.
    if (el.scrollTop <= 60 && hasMore && cursor && !loadingOlder) {
      setLoadingOlder(true);
      restore.current = el.scrollHeight;
      try {
        const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages?before=${encodeURIComponent(cursor)}`);
        const d = res.ok ? await res.json() : { messages: [], hasMore: false, nextCursor: null };
        setMessages((c) => [...(d.messages || []), ...c]);
        setHasMore(!!d.hasMore);
        setCursor(d.nextCursor);
      } finally {
        setLoadingOlder(false);
      }
      return;
    }
    // Newer messages when near the bottom (after a deep-linked "around" load).
    if (
      hasNewer &&
      newerCursor &&
      !loadingNewer &&
      el.scrollHeight - el.scrollTop - el.clientHeight < 80
    ) {
      setLoadingNewer(true);
      try {
        const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages?after=${encodeURIComponent(newerCursor)}`);
        const d = res.ok ? await res.json() : { messages: [], hasNewer: false, newerCursor: null };
        setMessages((c) => [...c, ...(d.messages || [])]);
        setHasNewer(!!d.hasNewer);
        hasNewerRef.current = !!d.hasNewer;
        setNewerCursor(d.newerCursor ?? null);
      } finally {
        setLoadingNewer(false);
      }
    }
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current;
      restore.current = null;
    }
  }, [messages]);

  async function jumpToNewest() {
    setFarBack(false);
    await loadLatest();
    requestAnimationFrame(() => scrollToBottom("auto"));
  }

  // Convert tracked "@Name" tokens to wire markup on send.
  function buildContent(raw: string): string {
    let out = raw;
    for (const [token, id] of mentionMap.current) {
      const name = token.slice(1);
      out = out.split(token).join(`@[${name}](${id})`);
    }
    return out;
  }

  function resetComposerHeight() {
    const ta = taRef.current;
    if (ta) ta.style.height = "auto";
  }
  function autoGrow() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }

  // Stage an image in the composer (iMessage-style) rather than sending at once.
  function stageImage(file: File) {
    setStaged((cur) => {
      if (cur) URL.revokeObjectURL(cur.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
    setPanel(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }
  function clearStaged() {
    setStaged((cur) => {
      if (cur) URL.revokeObjectURL(cur.preview);
      return null;
    });
  }

  async function send() {
    const raw = text.trim();
    if ((!raw && !staged) || sending) return;
    const wire = raw ? buildContent(raw) : null;
    const replySnap = replyTo;
    const stagedSnap = staged;
    setText("");
    setMention(null);
    setReplyTo(null);
    setStaged(null);
    resetComposerHeight();

    const temp: Msg = {
      id: `temp-${Date.now()}`,
      room_id: roomId,
      sender_id: userId,
      content: wire,
      image_url: stagedSnap?.preview ?? null,
      reply_to_id: replySnap?.id ?? null,
      reply_to: replySnap
        ? { content: replySnap.content, image_url: replySnap.image_url, sender: one(replySnap.sender) }
        : null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((cur) => [...cur, temp]);
    requestAnimationFrame(() => scrollToBottom("smooth"));
    setSending(true);
    try {
      let imageUrl: string | null = null;
      if (stagedSnap) {
        const fd = new FormData();
        fd.append("file", stagedSnap.file);
        const up = await fetch(`/api/v2/chat/rooms/${roomId}/upload`, { method: "POST", body: fd });
        if (!up.ok) throw new Error();
        imageUrl = (await up.json()).url;
      }
      const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: wire, imageUrl, replyToId: replySnap?.id || null }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      // The POST response lacks the reply_to preview — carry the snapshot for display.
      const final: Msg = { ...d.message, reply_to: temp.reply_to };
      setMessages((cur) => [...cur.filter((m) => m.id !== temp.id && m.id !== final.id), final]);
      if (stagedSnap) URL.revokeObjectURL(stagedSnap.preview);
    } catch {
      setMessages((cur) =>
        cur.map((m) => (m.id === temp.id ? { ...m, pending: false, content: `${m.content || ""} (failed)` } : m)),
      );
    } finally {
      setSending(false);
    }
  }

  async function sendImageUrl(url: string) {
    const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: url }),
    });
    if (res.ok) {
      const d = await res.json();
      mergeIncoming(d.message);
      requestAnimationFrame(() => scrollToBottom("smooth"));
    }
  }

  function deleteMessage(id: string) {
    setTapbackFor(null);
    setMessages((cur) => cur.filter((m) => m.id !== id));
    fetch(`/api/v2/chat/rooms/${roomId}/messages/${id}`, { method: "DELETE" }).catch(() => {});
  }

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    fetch(`/api/v2/chat/rooms/${roomId}/pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    }).catch(() => {});
  }

  // Giphy search (debounced-ish via the panel).
  useEffect(() => {
    if (panel !== "gif") return;
    const key = process.env.NEXT_PUBLIC_GIPHY_API_KEY;
    if (!key) return;
    let cancelled = false;
    const q = gifQuery.trim();
    const endpoint = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(q)}&limit=24&rating=pg-13`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=24&rating=pg-13`;
    const t = setTimeout(() => {
      fetch(endpoint)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          type GiphyItem = { id: string; images: { fixed_width: { url: string } } };
          setGifs((d.data || []).map((g: GiphyItem) => ({ id: g.id, url: g.images.fixed_width.url })));
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [panel, gifQuery]);

  function openFilePicker(camera: boolean) {
    const input = fileRef.current;
    if (!input) return;
    if (camera) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
    setPanel(null);
  }

  function insertEmoji(emoji: string) {
    const ta = taRef.current;
    if (!ta) {
      setText((t) => t + emoji);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
    });
  }

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setText(v);
    autoGrow();
    signalTyping();
    // Detect an @mention token ending at the caret.
    const caret = e.target.selectionStart ?? v.length;
    const before = v.slice(0, caret);
    const m = before.match(/@([\p{L}\p{N}'.\- ]{0,30})$/u);
    if (m && !before.slice(0, m.index).endsWith("]")) {
      setMention({ query: m[1].toLowerCase(), start: m.index ?? 0 });
    } else {
      setMention(null);
    }
  }

  function pickMention(member: Member) {
    if (!mention) return;
    const token = `@${member.displayName}`;
    const v = text;
    const next = v.slice(0, mention.start) + token + " " + v.slice((taRef.current?.selectionStart ?? v.length));
    mentionMap.current.set(token, member.userId);
    setText(next);
    setMention(null);
    taRef.current?.focus();
  }

  async function toggleReaction(messageId: string, emoji: string) {
    const msg = messages.find((m) => m.id === messageId);
    const mine = msg?.reactions?.some((r) => r.emoji === emoji && r.user_id === userId);
    setTapbackFor(null);
    // Optimistic.
    setMessages((cur) =>
      cur.map((m) => {
        if (m.id !== messageId) return m;
        const rx = m.reactions || [];
        return {
          ...m,
          reactions: mine
            ? rx.filter((r) => !(r.emoji === emoji && r.user_id === userId))
            : [...rx, { emoji, user_id: userId }],
        };
      }),
    );
    fetch(`/api/v2/chat/rooms/${roomId}/reactions`, {
      method: mine ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, emoji }),
    }).catch(() => {});
  }

  const nameFor = (id: string) =>
    members.find((m) => m.userId === id)?.displayName || (id === userId ? "You" : "Member");

  // Long-press an image → open the tapback (tap opens the lightbox instead).
  function imageDown(messageId: string) {
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      setReactionDetail(null);
      setTapbackFor(messageId);
    }, 450);
  }

  // Long-press a reaction badge → show who reacted; a normal tap toggles it.
  function badgeDown(messageId: string, emoji: string) {
    longPress.current.fired = false;
    longPress.current.timer = setTimeout(() => {
      longPress.current.fired = true;
      setTapbackFor(null);
      setReactionDetail({ messageId, emoji });
    }, 450);
  }
  function badgeUp() {
    if (longPress.current.timer) {
      clearTimeout(longPress.current.timer);
      longPress.current.timer = null;
    }
  }
  function badgeClick(e: React.MouseEvent, messageId: string, emoji: string) {
    e.stopPropagation();
    if (longPress.current.fired) {
      longPress.current.fired = false;
      return;
    }
    toggleReaction(messageId, emoji);
  }

  const mentionMatches =
    mention === null
      ? []
      : members.filter((m) => m.userId !== userId && m.displayName.toLowerCase().includes(mention.query)).slice(0, 6);

  const title = room?.name || "Conversation";

  return (
    <div className={styles.room}>
      <div className={styles.roomHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Back">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className={styles.roomHeaderName}>{title}</span>
        <button
          type="button"
          className={styles.pinBtn}
          data-on={pinned || undefined}
          onClick={togglePin}
          aria-label={pinned ? "Unpin conversation" : "Pin conversation"}
          title={pinned ? "Unpin" : "Pin"}
        >
          <svg width="18" height="18" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 17v5M9 10.76V5a2 2 0 012-2h2a2 2 0 012 2v5.76a2 2 0 00.58 1.42L18 15H6l2.42-2.82A2 2 0 009 10.76z" />
          </svg>
        </button>
      </div>

      <div
        className={styles.scroll}
        ref={scrollRef}
        onScroll={onScroll}
        onClick={() => {
          setTapbackFor(null);
          setReactionDetail(null);
        }}
      >
        {loadingOlder && <p className={styles.olderSpinner}>Loading earlier…</p>}
        {!hasMore && ready && messages.length > 0 && (
          <p className={styles.historyStart}>Beginning of the conversation</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.sender_id === userId;
          const sender = one(m.sender);
          const senderName = pickName(sender, mode);
          const showDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
          const grouped =
            !!prev &&
            prev.sender_id === m.sender_id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000 &&
            !showDay;
          // Aggregate reactions.
          const agg = new Map<string, { count: number; mine: boolean }>();
          for (const r of m.reactions || []) {
            const e = agg.get(r.emoji) || { count: 0, mine: false };
            e.count += 1;
            if (r.user_id === userId) e.mine = true;
            agg.set(r.emoji, e);
          }
          return (
            <div key={m.id} data-mid={m.id}>
              {showDay && <div className={styles.dayDivider}>{dayOf(m.created_at)}</div>}
              <div className={styles.msgRow} data-mine={mine || undefined} data-hl={highlightId === m.id || undefined}>
                <div className={styles.msgCol}>
                  {!mine && !grouped && (
                    <div className={styles.msgHead}>
                      {sender?.avatar_url ? (
                        <img src={sender.avatar_url} alt="" className={styles.msgAvatar} />
                      ) : (
                        <span className={styles.msgAvatarFallback}>
                          {senderName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className={styles.msgSender}>{senderName}</span>
                    </div>
                  )}
                  <div className={styles.bubbleWrap}>
                    {tapbackFor === m.id && (
                      <div className={styles.tapbackBar} data-mine={mine || undefined}>
                        {TAPBACKS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            className={styles.tapbackEmoji}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggleReaction(m.id, e);
                            }}
                          >
                            {e}
                          </button>
                        ))}
                        <span className={styles.tapbackSep} aria-hidden />
                        <button
                          type="button"
                          className={styles.tapbackAction}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setTapbackFor(null);
                            setReplyTo(m);
                            requestAnimationFrame(() => taRef.current?.focus());
                          }}
                          aria-label="Reply"
                          title="Reply"
                        >
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M9 17l-5-5 5-5M4 12h11a4 4 0 014 4v2" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className={styles.tapbackDelete}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            deleteMessage(m.id);
                          }}
                          aria-label="Delete for me"
                          title="Delete for me"
                        >
                          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6" />
                          </svg>
                        </button>
                      </div>
                    )}
                    <div
                      className={styles.bubble}
                      data-mine={mine || undefined}
                      data-pending={m.pending || undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (m.pending) return;
                        setReactionDetail(null);
                        setTapbackFor((cur) => (cur === m.id ? null : m.id));
                      }}
                    >
                      {m.reply_to && (
                        <span className={styles.replyQuote}>
                          <span className={styles.replyQuoteName}>
                            {m.reply_to.sender ? pickName(one(m.reply_to.sender), mode) : "Reply"}
                          </span>
                          <span className={styles.replyQuoteText}>
                            {m.reply_to.content
                              ? m.reply_to.content.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1")
                              : m.reply_to.image_url
                                ? "📷 Photo"
                                : ""}
                          </span>
                        </span>
                      )}
                      {m.image_url && (
                        <img
                          src={m.image_url}
                          alt=""
                          className={styles.bubbleImage}
                          onPointerDown={() => imageDown(m.id)}
                          onPointerUp={badgeUp}
                          onPointerLeave={badgeUp}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (longPress.current.fired) {
                              longPress.current.fired = false;
                              return;
                            }
                            if (!m.pending) setLightbox({ id: m.id, src: m.image_url! });
                          }}
                        />
                      )}
                      {m.content && <span className={styles.bubbleText}>{renderContent(m.content)}</span>}
                    </div>
                  </div>
                  {agg.size > 0 && (
                    <div className={styles.reactions}>
                      {[...agg.entries()].map(([emoji, { count, mine: rmine }]) => (
                        <button
                          key={emoji}
                          type="button"
                          className={styles.reactionBadge}
                          data-mine={rmine || undefined}
                          onClick={(e) => badgeClick(e, m.id, emoji)}
                          onPointerDown={() => badgeDown(m.id, emoji)}
                          onPointerUp={badgeUp}
                          onPointerLeave={badgeUp}
                        >
                          {emoji} {count}
                        </button>
                      ))}
                      {reactionDetail?.messageId === m.id && (
                        <div
                          className={styles.reactorPop}
                          data-mine={mine || undefined}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className={styles.reactorEmoji}>{reactionDetail.emoji}</span>
                          <span className={styles.reactorNames}>
                            {(m.reactions || [])
                              .filter((r) => r.emoji === reactionDetail.emoji)
                              .map((r) => nameFor(r.user_id))
                              .join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <span className={styles.msgTime}>{timeOf(m.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {farBack && hasNewer && (
        <button type="button" className={styles.jumpNewest} onClick={jumpToNewest} aria-label="Jump to newest">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
          Newest
        </button>
      )}

      {typing.length > 0 && (
        <div className={styles.typing}>
          {typing.length === 1 ? `${typing[0]} is typing…` : "Several people are typing…"}
        </div>
      )}

      {mentionMatches.length > 0 && (
        <div className={styles.mentionMenu}>
          {mentionMatches.map((mem) => (
            <button key={mem.userId} type="button" className={styles.mentionOption} onClick={() => pickMention(mem)}>
              {mem.avatarUrl ? (
                <img src={mem.avatarUrl} alt="" className={styles.mentionAvatar} />
              ) : (
                <span className={styles.mentionAvatarFallback}>{mem.displayName.charAt(0).toUpperCase()}</span>
              )}
              {mem.displayName}
            </button>
          ))}
        </div>
      )}

      {/* Attachment menu (from the "+"): Camera · Photos · GIFs · Emoji. */}
      {panel === "menu" && (
        <div className={styles.attachMenu}>
          <button type="button" className={styles.attachItem} onClick={() => openFilePicker(true)}>
            <span className={styles.attachIcon}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
            Camera
          </button>
          <button type="button" className={styles.attachItem} onClick={() => openFilePicker(false)}>
            <span className={styles.attachIcon}>
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10" r="1.5" />
                <path d="M21 16l-5-5-9 8" />
              </svg>
            </span>
            Photos
          </button>
          <button type="button" className={styles.attachItem} onClick={() => setPanel("gif")}>
            <span className={styles.attachIcon}>
              <strong className={styles.attachGif}>GIF</strong>
            </span>
            GIFs
          </button>
          <button type="button" className={styles.attachItem} onClick={() => setPanel("emoji")}>
            <span className={styles.attachIcon} aria-hidden>😊</span>
            Emoji
          </button>
        </div>
      )}

      {panel === "emoji" && (
        <div className={styles.emojiPanel}>
          {EMOJIS.map((e) => (
            <button key={e} type="button" className={styles.emojiCell} onClick={() => insertEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {panel === "gif" && (
        <div className={styles.gifPanel}>
          <input
            className={styles.gifSearch}
            value={gifQuery}
            onChange={(e) => setGifQuery(e.target.value)}
            placeholder="Search GIFs"
            autoFocus
          />
          <div className={styles.gifGrid}>
            {gifs.map((g) => (
              <button
                key={g.id}
                type="button"
                className={styles.gifCell}
                onClick={() => {
                  sendImageUrl(g.url);
                  setPanel(null);
                  setGifQuery("");
                }}
              >
                <img src={g.url} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) stageImage(f);
          e.target.value = "";
        }}
      />

      {/* Reply + staged-image chips sit above the composer (iMessage-style). */}
      {replyTo && (
        <div className={styles.replyBar}>
          <span className={styles.replyBarBadge} aria-hidden>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M9 17l-5-5 5-5M4 12h11a4 4 0 014 4v2" />
            </svg>
          </span>
          <span className={styles.replyBarText}>
            <span className={styles.replyBarName}>Replying to {replyTo.sender ? pickName(one(replyTo.sender), mode) : "message"}</span>
            <span className={styles.replyBarPreview}>
              {replyTo.content
                ? replyTo.content.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1")
                : replyTo.image_url
                  ? "📷 Photo"
                  : ""}
            </span>
          </span>
          <button type="button" className={styles.chipClose} onClick={() => setReplyTo(null)} aria-label="Cancel reply">
            ×
          </button>
        </div>
      )}
      {staged && (
        <div className={styles.stagedBar}>
          <img src={staged.preview} alt="" className={styles.stagedThumb} />
          <button type="button" className={styles.stagedRemove} onClick={clearStaged} aria-label="Remove photo">
            ×
          </button>
        </div>
      )}

      <div className={styles.inputBar}>
        <button
          type="button"
          className={styles.plusBtn}
          data-open={panel !== null || undefined}
          onClick={() => setPanel((cur) => (cur === null ? "menu" : null))}
          aria-label="Add attachment"
          disabled={sending}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <textarea
          ref={taRef}
          className={styles.input}
          value={text}
          onChange={onTextChange}
          onFocus={() => setPanel(null)}
          onPaste={(e) => {
            const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (img) {
              e.preventDefault();
              stageImage(img);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message"
          rows={1}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={send}
          disabled={(!text.trim() && !staged) || sending}
          aria-label="Send"
        >
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>

      {lightbox &&
        (() => {
          const lm = messages.find((m) => m.id === lightbox.id);
          const agg = new Map<string, { count: number; mine: boolean }>();
          for (const r of lm?.reactions || []) {
            const e = agg.get(r.emoji) || { count: 0, mine: false };
            e.count += 1;
            if (r.user_id === userId) e.mine = true;
            agg.set(r.emoji, e);
          }
          const reactions = [...agg.entries()].map(([emoji, v]) => ({ emoji, ...v }));
          return (
            <ImageLightbox
              src={lightbox.src}
              reactions={reactions}
              onReact={(emoji) => toggleReaction(lightbox.id, emoji)}
              onClose={() => setLightbox(null)}
            />
          );
        })()}
    </div>
  );
}
