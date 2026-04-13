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
}) {
  const router = useRouter();
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

  const scrollToBottom = useCallback(() => {
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  // Fetch initial messages
  useEffect(() => {
    fetch(`/api/chat/rooms/${roomId}/messages?limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setMessages((data.messages || []).reverse());
        setHasMore((data.messages || []).length >= 50);
        setLoading(false);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView();
        }, 50);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [roomId]);

  // Mark as read when entering and when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      fetch(`/api/chat/rooms/${roomId}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: lastMsg.id }),
      }).catch(() => {});
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
          // Skip if we already have this message (optimistic send)
          const alreadyExists = (prev: Message[]) =>
            prev.some((m) => m.id === payload.new.id);

          // Fetch the full message with sender info
          const res = await fetch(
            `/api/chat/rooms/${roomId}/messages?limit=1`
          );
          const data = await res.json();
          if (data.messages?.[0]?.id === payload.new.id) {
            const fullMessage = data.messages[0];
            setMessages((prev) => {
              if (alreadyExists(prev)) {
                // Replace optimistic version with full server data
                return prev.map((m) =>
                  m.id === fullMessage.id ? fullMessage : m
                );
              }
              return [...prev, fullMessage];
            });
            // Auto-scroll if near bottom
            const container = scrollContainerRef.current;
            if (container) {
              const isNearBottom =
                container.scrollHeight -
                  container.scrollTop -
                  container.clientHeight <
                150;
              shouldScrollRef.current = isNearBottom || payload.new.sender_id === currentUserId;
            }
            setTimeout(scrollToBottom, 50);
          }
        }
      )
      .subscribe();

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
  }, [roomId, currentUserId, scrollToBottom]);

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
          onClick={() => router.push("/chat")}
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
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          members={chatMembers}
          onClose={() => setShowSettings(false)}
          onRename={handleRename}
          onMembersChanged={handleMembersChanged}
          onLeft={() => router.push("/chat")}
        />
      )}
    </div>
  );
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
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
