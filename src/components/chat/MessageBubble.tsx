"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { TapbackMenu } from "./TapbackMenu";
import { ReactionBadge } from "./ReactionBadge";

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function Linkify({ text, isSent }: { text: string; isSent: boolean }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline ${isSent ? "text-green-100" : "text-blue-600"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

interface Message {
  id: string;
  content: string | null;
  image_url: string | null;
  reply_to_id: string | null;
  created_at: string;
  sender: { id: string; display_name: string } | null;
  reactions: { id: string; emoji: string; user_id: string }[];
  reply_to: {
    id: string;
    content: string | null;
    sender: { display_name: string } | null;
  } | null;
}

export function MessageBubble({
  message,
  isSent,
  isGrouped,
  isLastInGroup,
  showSender,
  currentUserId,
  onReply,
  onReaction,
  onDelete,
}: {
  message: Message;
  isSent: boolean;
  isGrouped: boolean;
  isLastInGroup: boolean;
  showSender: boolean;
  currentUserId: string;
  onReply: () => void;
  onReaction: (emoji: string) => void;
  onDelete?: () => void;
}) {
  const [showTapback, setShowTapback] = useState(false);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    longPressTimer.current = setTimeout(() => {
      setShowTapback(true);
      setTouchStart(null);
    }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStart.x;
    const deltaY = Math.abs(touch.clientY - touchStart.y);

    // Cancel long press if moving
    if (Math.abs(deltaX) > 10 || deltaY > 10) {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }

    // Swipe right to reply (received messages only, or any message)
    if (deltaX > 0 && deltaY < 30) {
      setSwipeOffset(Math.min(deltaX * 0.4, 60));
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (swipeOffset > 40) {
      onReply();
    }
    setSwipeOffset(0);
    setTouchStart(null);
  };

  const groupedReactions = message.reactions?.reduce(
    (acc, r) => {
      if (!acc[r.emoji]) {
        acc[r.emoji] = { emoji: r.emoji, count: 0, hasOwn: false };
      }
      acc[r.emoji].count++;
      if (r.user_id === currentUserId) {
        acc[r.emoji].hasOwn = true;
      }
      return acc;
    },
    {} as Record<string, { emoji: string; count: number; hasOwn: boolean }>
  );

  const reactionList = Object.values(groupedReactions || {});

  return (
    <div
      className={`relative flex ${isSent ? "justify-end" : "justify-start"} ${
        isGrouped ? "mt-0.5" : "mt-2"
      }`}
      style={{
        transform: `translateX(${swipeOffset}px)`,
        transition: swipeOffset === 0 ? "transform 0.2s ease-out" : "none",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Reply arrow indicator on swipe */}
      {swipeOffset > 20 && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </div>
      )}

      <div className={`max-w-[75%] ${isSent ? "items-end" : "items-start"}`}>
        {/* Sender name for group chats */}
        {showSender && message.sender && (
          <p className="text-[11px] text-gray-500 font-medium ml-3 mb-0.5">
            <Link href={`/loozers/${message.sender.id}`} className="hover:underline">
              {message.sender.display_name}
            </Link>
          </p>
        )}

        {/* Reply preview — iMessage style: compact bubble above the message */}
        {message.reply_to && (
          <div
            className={`flex ${isSent ? "justify-end" : "justify-start"} mb-0.5`}
          >
            <div className={`rounded-2xl px-3 py-1.5 max-w-full ${
              isSent ? "bg-green-600/40" : "bg-gray-300/60"
            }`}>
              <p className={`text-[11px] font-semibold ${
                isSent ? "text-green-100" : "text-gray-600"
              }`}>
                {message.reply_to.sender?.display_name || "Unknown"}
              </p>
              <p className={`text-[12px] truncate ${
                isSent ? "text-green-200/80" : "text-gray-500"
              }`}>
                {message.reply_to.content || "Image"}
              </p>
            </div>
          </div>
        )}

        {/* Message bubble */}
        <div
          ref={bubbleRef}
          className={`relative px-3 py-1.5 ${
            isSent
              ? `bg-green-600 text-white ${
                  isLastInGroup
                    ? "rounded-2xl rounded-br-md"
                    : "rounded-2xl"
                }`
              : `bg-gray-200 text-gray-900 ${
                  isLastInGroup
                    ? "rounded-2xl rounded-bl-md"
                    : "rounded-2xl"
                }`
          }`}
          onClick={() => setShowTapback(true)}
        >
          {/* Image / GIF */}
          {message.image_url && (
            <div className={message.image_url.includes("giphy.com") && !message.content
              ? "-mx-3 -my-1.5"
              : "mb-1 -mx-1 -mt-0.5"
            }>
              <img
                src={message.image_url}
                alt={message.image_url.includes("giphy.com") ? "GIF" : "Shared image"}
                className={message.image_url.includes("giphy.com") && !message.content
                  ? "rounded-2xl max-w-full max-h-64 object-cover w-full"
                  : "rounded-xl max-w-full max-h-64 object-cover"
                }
                loading="lazy"
              />
            </div>
          )}

          {/* Text content */}
          {message.content && (
            <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
              <Linkify text={message.content} isSent={isSent} />
            </p>
          )}

          {/* Timestamp on last in group */}
          {isLastInGroup && (
            <p
              className={`text-[10px] mt-0.5 ${
                isSent ? "text-green-200" : "text-gray-400"
              }`}
            >
              {new Date(message.created_at).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {/* Reactions */}
        {reactionList.length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-0.5 ${
              isSent ? "justify-end" : "justify-start"
            }`}
          >
            {reactionList.map((r) => (
              <ReactionBadge
                key={r.emoji}
                emoji={r.emoji}
                count={r.count}
                hasOwn={r.hasOwn}
                onClick={() => onReaction(r.emoji)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Tapback menu */}
      {showTapback && (
        <TapbackMenu
          isSent={isSent}
          onSelect={(emoji) => {
            onReaction(emoji);
            setShowTapback(false);
          }}
          onClose={() => setShowTapback(false)}
          onReply={() => {
            setShowTapback(false);
            onReply();
          }}
          onDelete={onDelete ? () => {
            setShowTapback(false);
            onDelete();
          } : undefined}
        />
      )}
    </div>
  );
}
