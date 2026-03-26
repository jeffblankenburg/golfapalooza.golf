"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { GifPicker } from "./GifPicker";
import { EmojiPicker } from "./EmojiPicker";

interface ReplyMessage {
  id: string;
  content: string | null;
  sender: { id: string; display_name: string } | null;
}

type ActivePanel = "menu" | "emoji" | "gif" | null;

export function MessageInput({
  onSend,
  onTyping,
  replyTo,
  onCancelReply,
  roomId,
}: {
  onSend: (content: string, imageUrl?: string) => void;
  onTyping: () => void;
  replyTo: ReplyMessage | null;
  onCancelReply: () => void;
  roomId: string;
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when text changes so the latest line is visible
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text]);

  // Focus input when replying
  useEffect(() => {
    if (replyTo) {
      textareaRef.current?.focus();
    }
  }, [replyTo]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    await onSend(trimmed);
    setText("");
    setSending(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setActivePanel(null);
    try {
      const supabase = createClient();

      const fileName = `${roomId}/${Date.now()}-${file.name}`;
      const { data, error } = await supabase.storage
        .from("chat-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Upload error:", error);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("chat-images")
        .getPublicUrl(data.path);

      await onSend(text.trim(), urlData.publicUrl);
      setText("");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((prev) => prev + emoji);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);

    requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    });
  };

  const handleGifSelect = async (gifUrl: string) => {
    setActivePanel(null);
    await onSend("", gifUrl);
  };

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const hasContent = text.trim().length > 0;

  return (
    <div className="border-t border-gray-200 bg-white pb-safe">
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
          <div className="w-0.5 h-8 bg-green-600 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-green-700 font-medium">
              {replyTo.sender?.display_name || "Unknown"}
            </p>
            <p className="text-[12px] text-gray-500 truncate">
              {replyTo.content || "Image"}
            </p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex items-center justify-center w-6 h-6 flex-shrink-0"
          >
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* App drawer — iMessage-style icon row */}
      {activePanel === "menu" && (
        <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 bg-gray-50">
          {/* Camera */}
          <button
            onClick={() => {
              setActivePanel(null);
              fileInputRef.current?.click();
            }}
            disabled={uploading}
            className="flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-full bg-green-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-[10px] text-gray-500 font-medium">Camera</span>
          </button>

          {/* Photos */}
          <button
            onClick={() => {
              setActivePanel(null);
              // Use file input with gallery
              if (fileInputRef.current) {
                fileInputRef.current.setAttribute("capture", "");
                fileInputRef.current.click();
                fileInputRef.current.removeAttribute("capture");
              }
            }}
            disabled={uploading}
            className="flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-[10px] text-gray-500 font-medium">Photos</span>
          </button>

          {/* GIF */}
          <button
            onClick={() => setActivePanel("gif")}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-[13px]">GIF</span>
            </div>
            <span className="text-[10px] text-gray-500 font-medium">GIFs</span>
          </button>

          {/* Emoji */}
          <button
            onClick={() => setActivePanel("emoji")}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="text-[10px] text-gray-500 font-medium">Emoji</span>
          </button>
        </div>
      )}

      {/* Emoji/GIF panels */}
      {(activePanel === "emoji" || activePanel === "gif") && (
        <div className="h-72 border-b border-gray-200">
          {activePanel === "emoji" && <EmojiPicker onSelect={handleEmojiSelect} />}
          {activePanel === "gif" && <GifPicker onSelect={handleGifSelect} />}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Input area */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* + button */}
        <button
          onClick={() => togglePanel("menu")}
          disabled={uploading}
          className={`flex items-center justify-center w-9 h-9 flex-shrink-0 transition-transform ${
            activePanel === "menu" ? "rotate-45 text-gray-400" : "text-green-600"
          } disabled:opacity-50`}
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
            </svg>
          )}
        </button>

        {/* Text input bubble */}
        <div className="flex-1 min-w-0 rounded-full border border-gray-300">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onTyping();
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (activePanel === "menu") setActivePanel(null);
            }}
            placeholder="Message"
            rows={1}
            style={{ backgroundColor: "transparent" }}
            className="block w-full m-0 px-4 py-2 text-[16px] text-gray-900 placeholder-gray-400 resize-none outline-none border-none h-[36px] overflow-y-auto"
          />
        </div>

        {/* Send button */}
        <button
          onClick={handleSubmit}
          disabled={!hasContent || sending}
          className={`flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 transition-all ${
            hasContent
              ? "bg-green-600 text-white"
              : "bg-gray-200 text-gray-400"
          } disabled:opacity-50`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
