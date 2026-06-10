"use client";

import { useState } from "react";

const EMOJI_OPTIONS = [
  { emoji: "\u2764\uFE0F", label: "Love" },
  { emoji: "\uD83D\uDC4D", label: "Thumbs up" },
  { emoji: "\uD83D\uDC4E", label: "Thumbs down" },
  { emoji: "\uD83D\uDE02", label: "Haha" },
  { emoji: "\u2757\uFE0F", label: "Exclamation" },
  { emoji: "\u2753", label: "Question" },
];

export function MediaReactions({
  itemId,
  reactions,
  onClose,
  onReactionChanged,
}: {
  itemId: string;
  reactions: Record<string, { count: number; hasReacted: boolean }>;
  onClose: () => void;
  onReactionChanged: (
    newReactions: Record<string, { count: number; hasReacted: boolean }>
  ) => void;
}) {
  const [localReactions, setLocalReactions] = useState(reactions);

  const toggleReaction = async (emoji: string) => {
    const current = localReactions[emoji];
    const hasReacted = current?.hasReacted || false;

    // Optimistic update
    const updated = { ...localReactions };
    if (hasReacted) {
      if (current.count <= 1) {
        delete updated[emoji];
      } else {
        updated[emoji] = { count: current.count - 1, hasReacted: false };
      }
    } else {
      updated[emoji] = {
        count: (current?.count || 0) + 1,
        hasReacted: true,
      };
    }
    setLocalReactions(updated);
    onReactionChanged(updated);

    // API call
    const method = hasReacted ? "DELETE" : "POST";
    await fetch(`/api/gallery/${itemId}/reactions`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
  };

  return (
    <div
      className="absolute inset-0 z-20 flex items-end justify-center pb-32"
      onClick={onClose}
    >
      <div
        className="bg-white/95 backdrop-blur rounded-2xl px-3 py-2 flex items-center gap-1 shadow-lg animate-tapback-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {EMOJI_OPTIONS.map(({ emoji, label }) => {
          const reaction = localReactions[emoji];
          const hasReacted = reaction?.hasReacted || false;

          return (
            <button
              key={emoji}
              onClick={() => toggleReaction(emoji)}
              title={label}
              className={`relative flex items-center justify-center w-11 h-11 rounded-full active:scale-90 transition-transform ${
                hasReacted ? "bg-green-100" : "hover:bg-gray-100"
              }`}
            >
              <span className="text-2xl">{emoji}</span>
              {reaction && reaction.count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-green-600 text-white text-[0.625rem] font-bold rounded-full flex items-center justify-center px-1">
                  {reaction.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
