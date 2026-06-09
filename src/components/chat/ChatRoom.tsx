"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { ChatRoomSettings } from "./ChatRoomSettings";
import { logActivity } from "@/components/ActivityTracker";

interface Message {
  id: string;
  content: string | null;
  image_url: string | null;
  reply_to_id: string | null;
  created_at: string;
  updated_at: string;
  sender: { id: string; display_name: string } | null;
  reactions: { id: string; emoji: string; user_id: string }[];
  reply_to: {
    id: string;
    content: string | null;
    sender: { display_name: string } | null;
  } | null;
}

export interface ChatMember {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

export function ChatRoom({
  roomId,
  roomName,
  rawRoomName,
  roomType,
  currentUserId,
  currentUserName,
  memberCount,
  currentUserRole = "member",
  createdBy,
  members: initialMembers = [],
  onBack,
  revealedAt,
}: {
  roomId: string;
  roomName: string;
  rawRoomName?: string | null;
  roomType: string;
  currentUserId: string;
  currentUserName: string;
  memberCount: number;
  currentUserRole?: string;
  createdBy?: string | null;
  members?: ChatMember[];
  // When provided (e.g., rendered inside ChatDrawer), back/leave actions
  // call this instead of router.push("/chat"). Falls back to navigation.
  onBack?: () => void;
  // Bumped by the parent every time the component is "revealed" again
  // (e.g., drawer reopened with this room mounted). Triggers a fresh
  // scroll-to-newest so the user always sees the latest message.
  revealedAt?: number;
}) {
  const router = useRouter();
  const goBack = useCallback(() => {
    if (onBack) onBack();
    else router.push("/chat");
  }, [onBack, router]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState(roomName);
  const [chatMembers, setChatMembers] = useState<ChatMember[]>(initialMembers);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldScrollRef = useRef(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presenceChannelRef = useRef<any>(null);

  // Snap the scroll container itself to its bottom. scrollIntoView on a
  // 0-height end-marker proved unreliable inside the drawer's nested
  // scroll containers during the open transition — set scrollTop directly.
  const snapToBottom = useCallback((smooth = false) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    if (shouldScrollRef.current) snapToBottom(true);
  }, [snapToBottom]);

  // Fetch the latest window of messages and merge by id. Used as a resync
  // fallback when the realtime channel may have missed events (iOS kills
  // PWA WebSockets when backgrounded, the network blipped, or the channel
  // never made it to SUBSCRIBED).
  const resyncMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages?limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched = ((data.messages || []) as Message[]).slice().reverse();
      if (fetched.length === 0) return;
      let didAddNew = false;
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.id, m]));
        for (const m of fetched) {
          if (!byId.has(m.id)) didAddNew = true;
          byId.set(m.id, m);
        }
        return Array.from(byId.values()).sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      });
      if (didAddNew) {
        // Resyncs fire on drawer reveal, tab visibility, network reconnect,
        // and channel (re)subscribe — all "catch me up" moments. Scroll
        // unconditionally so the user sees what they missed. (The in-the-
        // moment realtime INSERT handler still respects scroll position
        // so it doesn't yank you down while you're reading history.)
        shouldScrollRef.current = true;
        requestAnimationFrame(() => snapToBottom(true));
        setTimeout(() => snapToBottom(true), 350);
      }
    } catch {
      // Best-effort — the next realtime event or resync trigger will retry.
    }
  }, [roomId, snapToBottom]);

  // Snap to the newest message every time the drawer reveals this room.
  // Force-overrides `shouldScrollRef` (which may have been turned off by
  // the user scrolling up earlier) since opening the chat should always
  // show the latest content. The drawer's translate-y transition is
  // 300ms, so we snap twice — once on the next frame for snappiness,
  // and again after the transition lands in case layout shifted.
  // Also refetch — if the realtime channel was dead while the drawer was
  // closed (iOS kills PWA WebSockets when backgrounded), the local state
  // is stale.
  useEffect(() => {
    if (revealedAt == null) return;
    shouldScrollRef.current = true;
    const raf = requestAnimationFrame(() => {
      snapToBottom(false);
      void resyncMessages();
    });
    const t = setTimeout(() => snapToBottom(false), 350);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [revealedAt, snapToBottom, resyncMessages]);

  // Resync whenever the tab becomes visible again or the network comes
  // back online. The realtime WebSocket can die silently in either case
  // — particularly on iOS PWAs that get backgrounded — and there's no
  // built-in reconnect that catches up missed inserts.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void resyncMessages();
    };
    const onOnline = () => void resyncMessages();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [resyncMessages]);

  // Fetch initial messages
  useEffect(() => {
    fetch(`/api/chat/rooms/${roomId}/messages?limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setMessages((data.messages || []).reverse());
        setHasMore((data.messages || []).length >= 50);
        setLoading(false);
        requestAnimationFrame(() => snapToBottom(false));
        // Late settle for images/avatars that affect message heights.
        setTimeout(() => snapToBottom(false), 350);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [roomId, snapToBottom]);

  // Mark as read when entering and when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      fetch(`/api/chat/rooms/${roomId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: lastMsg.id }),
      })
        .then(() => {
          window.dispatchEvent(new CustomEvent("chat-read", { detail: { roomId } }));
        })
        .catch(() => {});
    }
  }, [roomId, messages]);

  // Real-time subscriptions
  useEffect(() => {
    const supabase = createClient();

    // New messages
    const messagesChannel = supabase
      .channel(`chat-messages-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          // Fetch a small window of recent messages and merge by id.
          // A limit=1 check is fragile: if two messages land in quick
          // succession, the fetch can return a different one than the
          // INSERT we're reacting to, and the new message gets dropped.
          const res = await fetch(`/api/chat/rooms/${roomId}/messages?limit=10`);
          const data = await res.json();
          const fetched = ((data.messages || []) as Message[]).slice().reverse();
          if (fetched.length === 0) return;

          let didAddNew = false;
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of fetched) {
              if (!byId.has(m.id)) didAddNew = true;
              byId.set(m.id, m);
            }
            return Array.from(byId.values()).sort(
              (a, b) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
          });

          if (didAddNew) {
            const container = scrollContainerRef.current;
            if (container) {
              const isNearBottom =
                container.scrollHeight -
                  container.scrollTop -
                  container.clientHeight <
                150;
              shouldScrollRef.current =
                isNearBottom || payload.new.sender_id === currentUserId;
            }
            setTimeout(scrollToBottom, 50);
          }
        }
      )
      .subscribe((status) => {
        // On (re)subscribe, Supabase does NOT replay missed inserts. Pull
        // the latest window so anything that landed while the socket was
        // down shows up.
        if (status === "SUBSCRIBED") void resyncMessages();
      });

    // Reactions
    const reactionsChannel = supabase
      .channel(`chat-reactions-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_reactions",
        },
        () => {
          // Refetch messages to get updated reactions
          fetch(`/api/chat/rooms/${roomId}/messages?limit=50`)
            .then((res) => res.json())
            .then((data) => {
              setMessages((data.messages || []).reverse());
            });
        }
      )
      .subscribe();

    // Typing indicators via presence
    const presenceChannel = supabase
      .channel(`typing-${roomId}`, {
        config: { presence: { key: currentUserId } },
      })
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const typing = Object.entries(state)
          .filter(([key]) => key !== currentUserId)
          .filter(([, presences]) =>
            (presences as { typing?: boolean }[]).some((p) => p.typing)
          )
          .map(([, presences]) => (presences as { name?: string }[])[0]?.name || "Someone");
        setTypingUsers(typing);
      })
      .subscribe();

    presenceChannelRef.current = presenceChannel;

    return () => {
      presenceChannelRef.current = null;
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(reactionsChannel);
      supabase.removeChannel(presenceChannel);
    };
  }, [roomId, currentUserId, scrollToBottom, resyncMessages]);

  // Load more messages
  const loadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[0];
    const res = await fetch(
      `/api/chat/rooms/${roomId}/messages?limit=50&cursor=${oldest.created_at}`
    );
    const data = await res.json();
    const olderMessages = (data.messages || []).reverse();
    setHasMore(olderMessages.length >= 50);

    // Preserve scroll position
    const container = scrollContainerRef.current;
    const scrollHeightBefore = container?.scrollHeight || 0;

    setMessages((prev) => [...olderMessages, ...prev]);

    requestAnimationFrame(() => {
      if (container) {
        container.scrollTop =
          container.scrollHeight - scrollHeightBefore + container.scrollTop;
      }
    });
    setLoadingMore(false);
  };

  // Handle scroll for infinite loading
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (container && container.scrollTop < 100) {
      loadMore();
    }
  };

  // Send typing indicator using the existing subscribed presence channel
  const handleTyping = useCallback(() => {
    const channel = presenceChannelRef.current;
    if (!channel) return;
    channel.track({ typing: true, name: "User" });
    setTimeout(() => {
      if (presenceChannelRef.current) {
        presenceChannelRef.current.track({ typing: false });
      }
    }, 3000);
  }, []);

  const handleSend = async (content: string, imageUrl?: string) => {
    const currentReplyTo = replyTo;
    setReplyTo(null);

    const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content || undefined,
        imageUrl: imageUrl || undefined,
        replyToId: currentReplyTo?.id || undefined,
      }),
    });

    if (res.ok) {
      logActivity("chat_message", `/chat/${roomId}`, {
        room_id: roomId,
        has_image: !!imageUrl,
        is_reply: !!currentReplyTo,
      });
      const { message: sent } = await res.json();
      const optimistic: Message = {
        id: sent.id,
        content: sent.content,
        image_url: sent.image_url,
        reply_to_id: currentReplyTo?.id || null,
        created_at: sent.created_at,
        updated_at: sent.created_at,
        sender: { id: currentUserId, display_name: currentUserName },
        reactions: [],
        reply_to: currentReplyTo
          ? {
              id: currentReplyTo.id,
              content: currentReplyTo.content,
              sender: currentReplyTo.sender
                ? { display_name: currentReplyTo.sender.display_name }
                : null,
            }
          : null,
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === sent.id)) return prev;
        return [...prev, optimistic];
      });
      shouldScrollRef.current = true;
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    const message = messages.find((m) => m.id === messageId);
    const existingReaction = message?.reactions?.find(
      (r) => r.emoji === emoji && r.user_id === currentUserId
    );

    if (existingReaction) {
      await fetch(`/api/chat/rooms/${roomId}/reactions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
    } else {
      await fetch(`/api/chat/rooms/${roomId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    // Optimistic removal
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    await fetch(`/api/chat/rooms/${roomId}/messages/${messageId}`, {
      method: "DELETE",
    });
  };

  const handleRename = (newName: string) => {
    setDisplayName(newName);
  };

  const handleMembersChanged = (newMembers: ChatMember[]) => {
    setChatMembers(newMembers);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white">
        <button
          onClick={goBack}
          className="flex items-center justify-center w-10 h-10 -ml-2"
        >
          <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[17px] font-semibold text-gray-900 truncate">
            {displayName}
          </h2>
          {roomType === "group" && (
            <p className="text-xs text-gray-500">{chatMembers.length} members</p>
          )}
        </div>
        {roomType === "group" && (
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center w-10 h-10 -mr-2"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-contain px-3 py-2"
      >
        {loadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <p className="text-sm">No messages yet. Say hello!</p>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const prevMessage = index > 0 ? messages[index - 1] : null;
              const nextMessage =
                index < messages.length - 1 ? messages[index + 1] : null;
              const isSent = message.sender?.id === currentUserId;
              const sameSenderAsPrev =
                prevMessage?.sender?.id === message.sender?.id;
              const sameSenderAsNext =
                nextMessage?.sender?.id === message.sender?.id;

              // Show time separator if gap > 5 minutes
              const showTimestamp =
                !prevMessage ||
                new Date(message.created_at).getTime() -
                  new Date(prevMessage.created_at).getTime() >
                  5 * 60 * 1000;

              return (
                <div key={message.id}>
                  {showTimestamp && (
                    <div className="text-center py-2">
                      <span className="text-[11px] text-gray-400 font-medium">
                        {formatTimestamp(message.created_at)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    isSent={isSent}
                    isGrouped={sameSenderAsPrev && !showTimestamp}
                    isLastInGroup={!sameSenderAsNext}
                    showSender={!isSent && roomType === "group" && (!sameSenderAsPrev || showTimestamp)}
                    currentUserId={currentUserId}
                    onReply={() => setReplyTo(message)}
                    onReaction={(emoji) => handleReaction(message.id, emoji)}
                    onDelete={() => handleDeleteMessage(message.id)}
                  />
                </div>
              );
            })}
          </>
        )}

        {typingUsers.length > 0 && <TypingIndicator users={typingUsers} />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <MessageInput
        onSend={handleSend}
        onTyping={handleTyping}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        roomId={roomId}
      />

      {/* Settings sheet */}
      {showSettings && (
        <ChatRoomSettings
          roomId={roomId}
          roomName={rawRoomName || ""}
          isSystemRoom={!createdBy}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          members={chatMembers}
          onClose={() => setShowSettings(false)}
          onRename={handleRename}
          onMembersChanged={handleMembersChanged}
          onLeft={goBack}
        />
      )}
    </div>
  );
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(date)) / (1000 * 60 * 60 * 24)
  );

  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Yesterday ${time}`;
  if (diffDays < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: "long" })} ${time}`;
  }
  return `${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })} ${time}`;
}
