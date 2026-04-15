"use client";

import { useEffect, useRef } from "react";

const TAPBACK_EMOJIS = [
  { emoji: "\u2764\uFE0F", label: "Love" },
  { emoji: "\uD83D\uDC4D", label: "Thumbs up" },
  { emoji: "\uD83D\uDC4E", label: "Thumbs down" },
  { emoji: "\uD83D\uDE02", label: "Haha" },
  { emoji: "\u203C\uFE0F", label: "Exclamation" },
  { emoji: "\u2753", label: "Question" },
];

export function TapbackMenu({
  isSent,
  onSelect,
  onClose,
  onReply,
  onDelete,
}: {
  isSent: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
  onReply: () => void;
  onDelete?: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className={`absolute z-10 bottom-full mb-1 ${
        isSent ? "right-0" : "left-0"
      }`}
    >
      <div className="flex items-center gap-0.5 bg-white rounded-full shadow-lg border border-gray-200 px-2 py-1.5 animate-tapback-pop">
        {TAPBACK_EMOJIS.map(({ emoji, label }) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            aria-label={label}
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors text-xl"
          >
            {emoji}
          </button>
        ))}
        <div className="w-px h-6 bg-gray-200 mx-0.5" />
        <button
          onClick={onReply}
          aria-label="Reply"
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
        >
          <svg className="w-4.5 h-4.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            aria-label="Delete"
            className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-red-50 active:bg-red-100 transition-colors"
          >
            <svg className="w-4.5 h-4.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
