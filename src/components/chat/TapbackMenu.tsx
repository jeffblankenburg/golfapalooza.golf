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
}: {
  isSent: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
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
      </div>
    </div>
  );
}
