"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
import styles from "./chat.module.css";
/* eslint-disable @next/next/no-img-element */

interface Sender {
  display_name: string;
  avatar_url: string | null;
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
  pending?: boolean;
}
interface RoomSummary {
  id: string;
  type: string;
  name: string | null;
  avatarUrl: string | null;
  isPinned: boolean;
  unread: number;
  members: { userId: string; displayName: string; avatarUrl: string | null }[];
  lastMessage: { content: string | null; imageUrl: string | null; createdAt: string } | null;
}

const one = (s: Msg["sender"]): Sender | null => (Array.isArray(s) ? s[0] ?? null : s ?? null);

// Render message text: @[Name](id) mention markup → styled @Name chips, and bare
// URLs → links. Mirrors the legacy MessageBubble.
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
      nodes.push(
        <span key={key++} className={styles.mention}>
          @{m[1]}
        </span>,
      );
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
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

export default function ChatDrawer({ orgId, userId }: { orgId: string; userId: string }) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);

  useEffect(() => {
    if (roomId !== null) return;
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
  }, [roomId, orgId]);

  if (roomId) {
    const room = rooms?.find((r) => r.id === roomId) || null;
    return <Room key={roomId} roomId={roomId} room={room} userId={userId} onBack={() => setRoomId(null)} />;
  }
  return <RoomList rooms={rooms} onOpen={setRoomId} />;
}

/* ── Room list ────────────────────────────────────────────────────────────── */
function RoomList({
  rooms,
  onOpen,
}: {
  rooms: RoomSummary[] | null;
  onOpen: (id: string) => void;
}) {
  if (rooms === null) return <p className={styles.loading}>Loading…</p>;
  if (rooms.length === 0) return <p className={styles.loading}>No conversations yet.</p>;
  return (
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
              <span className={styles.roomAvatarFallback}>
                {(r.name || "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className={styles.roomMeta}>
              <span className={styles.roomName}>
                {r.isPinned && <span className={styles.pin} aria-hidden>📌 </span>}
                {r.name || "Conversation"}
              </span>
              <span className={styles.roomPreview}>{preview}</span>
            </span>
            {r.unread > 0 && <span className={styles.roomUnread}>{r.unread > 99 ? "99+" : r.unread}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Room view ────────────────────────────────────────────────────────────── */
function Room({
  roomId,
  room,
  userId,
  onBack,
}: {
  roomId: string;
  room: RoomSummary | null;
  userId: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const restore = useRef<number | null>(null); // scrollHeight before a prepend

  const mergeIncoming = useCallback(
    (incoming: Msg) => {
      setMessages((cur) => {
        if (cur.some((m) => m.id === incoming.id)) return cur;
        // Replace a matching optimistic temp (same sender + content).
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
    },
    [],
  );

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

  // Initial load (newest page) + realtime + resync wiring.
  const loadLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages`);
      const d = res.ok ? await res.json() : { messages: [], hasMore: false, nextCursor: null };
      setMessages(d.messages || []);
      setHasMore(!!d.hasMore);
      setCursor(d.nextCursor);
      const last = d.messages?.[d.messages.length - 1];
      if (last) markRead(last.id);
    } finally {
      setReady(true);
    }
  }, [roomId, markRead]);

  // Initial newest page (inlined so no setState is called directly in the effect
  // body; Room is keyed by roomId so state starts fresh per room).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages`);
        const d = res.ok ? await res.json() : { messages: [], hasMore: false, nextCursor: null };
        if (cancelled) return;
        setMessages(d.messages || []);
        setHasMore(!!d.hasMore);
        setCursor(d.nextCursor);
        setReady(true);
        const last = d.messages?.[d.messages.length - 1];
        if (last) markRead(last.id);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, markRead]);

  // Scroll to bottom once the first page renders.
  useLayoutEffect(() => {
    if (ready && restore.current === null) scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Realtime new messages for this room.
  useEffect(() => {
    const supabase = v2BrowserClient();
    const channel = supabase
      .channel(`v2-chat-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "v2_chat_messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const row = payload.new as Msg;
          // Fetch the sender for display (payload doesn't include the join).
          if (!row.sender) {
            const { data } = await supabase
              .from("v2_profiles")
              .select("display_name, avatar_url")
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
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, userId, mergeIncoming, markRead, scrollToBottom]);

  // iOS-PWA / dropped-socket safety: resync latest on refocus + reconnect.
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

  // Load older on scroll-to-top, preserving position.
  async function onScroll() {
    const el = scrollRef.current;
    if (!el || loadingOlder || !hasMore || !cursor) return;
    if (el.scrollTop > 60) return;
    setLoadingOlder(true);
    restore.current = el.scrollHeight;
    try {
      const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages?before=${encodeURIComponent(cursor)}`);
      const d = res.ok ? await res.json() : { messages: [], hasMore: false, nextCursor: null };
      setMessages((cur) => [...(d.messages || []), ...cur]);
      setHasMore(!!d.hasMore);
      setCursor(d.nextCursor);
    } finally {
      setLoadingOlder(false);
    }
  }

  // After a prepend, keep the viewport anchored where the user was reading.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && restore.current !== null) {
      el.scrollTop = el.scrollHeight - restore.current;
      restore.current = null;
    }
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setText("");
    const temp: Msg = {
      id: `temp-${Date.now()}`,
      room_id: roomId,
      sender_id: userId,
      content: body,
      image_url: null,
      reply_to_id: null,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((cur) => [...cur, temp]);
    requestAnimationFrame(() => scrollToBottom("smooth"));
    setSending(true);
    try {
      const res = await fetch(`/api/v2/chat/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setMessages((cur) => {
        const withoutTemp = cur.filter((m) => m.id !== temp.id && m.id !== d.message.id);
        return [...withoutTemp, d.message];
      });
    } catch {
      // Mark the temp failed (keep it visible so nothing is silently lost).
      setMessages((cur) =>
        cur.map((m) => (m.id === temp.id ? { ...m, pending: false, content: `${m.content} (failed)` } : m)),
      );
    } finally {
      setSending(false);
    }
  }

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
      </div>

      <div className={styles.scroll} ref={scrollRef} onScroll={onScroll}>
        {loadingOlder && <p className={styles.olderSpinner}>Loading earlier…</p>}
        {!hasMore && ready && messages.length > 0 && (
          <p className={styles.historyStart}>Beginning of the conversation</p>
        )}
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const mine = m.sender_id === userId;
          const sender = one(m.sender);
          const showDay = !prev || dayOf(prev.created_at) !== dayOf(m.created_at);
          const grouped =
            !!prev &&
            prev.sender_id === m.sender_id &&
            new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000 &&
            !showDay;
          return (
            <div key={m.id}>
              {showDay && <div className={styles.dayDivider}>{dayOf(m.created_at)}</div>}
              <div className={styles.msgRow} data-mine={mine || undefined}>
                <div className={styles.msgCol}>
                  {!mine && !grouped && (
                    <div className={styles.msgHead}>
                      {sender?.avatar_url ? (
                        <img src={sender.avatar_url} alt="" className={styles.msgAvatar} />
                      ) : (
                        <span className={styles.msgAvatarFallback}>
                          {(sender?.display_name || "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className={styles.msgSender}>{sender?.display_name || "Member"}</span>
                    </div>
                  )}
                  <div className={styles.bubble} data-mine={mine || undefined} data-pending={m.pending || undefined}>
                    {m.image_url && <img src={m.image_url} alt="" className={styles.bubbleImage} />}
                    {m.content && <span className={styles.bubbleText}>{renderContent(m.content)}</span>}
                  </div>
                  <span className={styles.msgTime}>{timeOf(m.created_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.inputBar}>
        <textarea
          className={styles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Message"
          rows={1}
        />
        <button type="button" className={styles.sendBtn} onClick={send} disabled={!text.trim() || sending} aria-label="Send">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
