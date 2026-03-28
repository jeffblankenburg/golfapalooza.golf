"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { NotificationDrawer } from "./NotificationDrawer";
import { isPushSupported, getPermissionStatus, subscribeToPush } from "@/lib/notifications/push-client";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function HeaderBar({
  initialUnreadCount,
  initialChatUnreadCount,
  userId,
  displayName,
  avatarUrl,
}: {
  initialUnreadCount: number;
  initialChatUnreadCount: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [chatUnreadCount, setChatUnreadCount] = useState(initialChatUnreadCount);
  const [showNotifications, setShowNotifications] = useState(false);
  const pushChecked = useRef(false);

  // Auto-subscribe to push on mount if permission already granted
  useEffect(() => {
    if (pushChecked.current) return;
    pushChecked.current = true;

    if (isPushSupported() && getPermissionStatus() === "granted") {
      subscribeToPush();
    }
  }, []);

  const refetchCount = useCallback(() => {
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false)
      .neq("type", "chat_message")
      .then(({ count }) => {
        setUnreadCount(count || 0);
      });
  }, [userId]);

  const handleBellClick = async () => {
    // If push is supported but permission hasn't been requested yet, ask now
    if (isPushSupported() && getPermissionStatus() === "default") {
      await subscribeToPush();
    }
    refetchCount();
    setShowNotifications(true);
  };

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("notifications-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if ((payload.new as { type?: string })?.type !== "chat_message") {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refetchCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          refetchCount();
        }
      )
      .subscribe();

    // Chat badge: listen for new messages and read receipt updates
    const chatChannel = supabase
      .channel("chat-badge")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
        },
        (payload) => {
          const msg = payload.new as { sender_id?: string };
          if (msg.sender_id !== userId) {
            setChatUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_read_receipts",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // User read messages — refetch total unread from API
          fetch("/api/chat/rooms")
            .then((res) => res.json())
            .then((data) => {
              const total = (data.rooms || []).reduce(
                (sum: number, r: { unreadCount?: number }) => sum + (r.unreadCount || 0),
                0
              );
              setChatUnreadCount(total);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(chatChannel);
    };
  }, [userId]);

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
        <div className="relative flex items-center justify-between h-14 px-4">
          {/* Center: Logo (absolutely centered) */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Link href="/" className="pointer-events-auto">
              <Image
                src="/logo.png"
                alt="Golfapalooza"
                width={49}
                height={36}
                className="h-9 w-auto"
                priority
              />
            </Link>
          </div>

          {/* Left: Chat icon */}
          <Link
            href="/chat"
            className="relative flex items-center justify-center w-10 h-10 -ml-1"
          >
            <svg
              className="w-6 h-6 text-gray-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            {chatUnreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                {chatUnreadCount > 99 ? "99+" : chatUnreadCount}
              </span>
            )}
          </Link>

          {/* Right: Bell + Profile */}
          <div className="flex items-center gap-1 -mr-1">
            {/* Notification bell */}
            <button
              onClick={handleBellClick}
              className="relative flex items-center justify-center w-10 h-10"
            >
              <svg
                className="w-6 h-6 text-gray-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {/* Profile avatar */}
            <Link
              href="/profile"
              className="flex items-center justify-center w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-green-700 text-white"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[11px] font-semibold leading-none">
                  {getInitials(displayName)}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {showNotifications && (
        <NotificationDrawer
          userId={userId}
          onClose={() => setShowNotifications(false)}
          onMarkAllRead={() => setUnreadCount(0)}
        />
      )}
    </>
  );
}
