"use client";

import dynamic from "next/dynamic";

const Picker = dynamic(() => import("emoji-picker-react"), { ssr: false });

export function EmojiPicker({
  onSelect,
}: {
  onSelect: (emoji: string) => void;
}) {
  return (
    <div className="h-full overflow-hidden">
      <Picker
        onEmojiClick={(emojiData) => onSelect(emojiData.emoji)}
        width="100%"
        height="100%"
        previewConfig={{ showPreview: false }}
        skinTonesDisabled={false}
        searchPlaceholder="Search emojis"
        lazyLoadEmojis
      />
    </div>
  );
}
