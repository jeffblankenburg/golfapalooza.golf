"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/gallery/compress";
import { GifPicker } from "./GifPicker";
import { EmojiPicker } from "./EmojiPicker";
import { buildContentWithMentions, locateMentionSpans } from "@/lib/chat/mentions";

interface ReplyMessage {
  id: string;
  content: string | null;
  sender: { id: string; display_name: string } | null;
}

type ActivePanel = "menu" | "emoji" | "gif" | null;

interface MentionableMember {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function MessageInput({
  onSend,
  onTyping,
  replyTo,
  onCancelReply,
  roomId,
  members = [],
  currentUserId,
}: {
  onSend: (content: string, imageUrl?: string) => void;
  onTyping: () => void;
  replyTo: ReplyMessage | null;
  onCancelReply: () => void;
  roomId: string;
  members?: MentionableMember[];
  currentUserId?: string;
}) {
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  // Mention autocomplete state. `mentionQuery` is null when the dropdown
  // shouldn't show; a string (possibly empty) means the user just typed
  // @ or is editing a partial @query at the caret. `mentionRange` is the
  // [start, end] slice of `text` that the @query covers — picking an
  // option replaces that slice.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRange, setMentionRange] = useState<[number, number] | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  // Parallel list of mentions inserted via the picker. Drives send-time
  // conversion of plain "@Butter" to the markup "@[Butter](uuid)". Stays
  // in sync with the textarea text: see how `pickMention` adds entries
  // and how `handleSubmit` consumes + clears them.
  const [pendingMentions, setPendingMentions] = useState<
    { userId: string; displayName: string }[]
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Computed once per render: where the @mention spans land in the
  // current display text. The overlay paints highlight pills at exactly
  // these character ranges; the textarea's text sits on top of them.
  const mentionSpans = locateMentionSpans(text, pendingMentions);

  // Filter members against the active @query — case-insensitive prefix
  // match, then includes-anywhere as fallback. Excludes the current
  // user (you can't tag yourself) and caps at 6 visible options.
  const mentionMatches = (() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const pool = members.filter((m) => m.id !== currentUserId);
    if (q === "") return pool.slice(0, 6);
    const prefix = pool.filter((m) => m.display_name.toLowerCase().startsWith(q));
    const rest = pool.filter(
      (m) =>
        !m.display_name.toLowerCase().startsWith(q) &&
        m.display_name.toLowerCase().includes(q),
    );
    return [...prefix, ...rest].slice(0, 6);
  })();

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
    // Zip picker selections back into markup form for the wire — server
    // and renderer both work in `@[Name](uuid)` units.
    const content = buildContentWithMentions(trimmed, pendingMentions);
    await onSend(content);
    setText("");
    setPendingMentions([]);
    setSending(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "36px";
      textareaRef.current.focus();
    }
  };

  // Look back from the caret to detect an in-progress @mention. Stops
  // at the first whitespace, @ (so two @s in a row reset), or the start
  // of the string. Returns null if no active mention context.
  const detectMentionContext = (
    value: string,
    caret: number,
  ): { query: string; range: [number, number] } | null => {
    let i = caret - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@") {
        // Confirm @ is at start-of-string or preceded by whitespace —
        // emails like "foo@bar" must not trigger the picker.
        const prev = i > 0 ? value[i - 1] : "";
        if (i === 0 || /\s/.test(prev)) {
          return { query: value.slice(i + 1, caret), range: [i, caret] };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  };

  const updateMentionState = (value: string, caret: number) => {
    const ctx = detectMentionContext(value, caret);
    if (ctx) {
      setMentionQuery(ctx.query);
      setMentionRange(ctx.range);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionRange(null);
    }
  };

  const pickMention = (member: MentionableMember) => {
    if (!mentionRange) return;
    const [start, end] = mentionRange;
    // Insert *clean* text — the user sees "@Butter ", not the markup.
    // The userId is tracked separately and zipped back in at send time.
    const insert = `@${member.display_name} `;
    const next = text.slice(0, start) + insert + text.slice(end);
    setText(next);
    setPendingMentions((prev) => [
      ...prev,
      { userId: member.id, displayName: member.display_name },
    ]);
    setMentionQuery(null);
    setMentionRange(null);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      const pos = start + insert.length;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = pos;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // When the mention dropdown is open, hijack arrow keys + Enter / Tab
    // for navigation. Escape closes it without inserting.
    if (mentionQuery !== null && mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickMention(mentionMatches[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
        setMentionRange(null);
        return;
      }
    }
    // Otherwise Enter inserts a new line (default textarea behavior).
  };

  // Shared upload path for every image source — file picker, camera, clipboard
  // paste, and drag-drop. Compresses, uploads to the chat-images bucket, then
  // fires the message with the current text as a caption.
  const uploadAndSendImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    setActivePanel(null);
    try {
      const supabase = createClient();

      // Compress to chat-sized dimensions before upload. Chat images are
      // viewed at <500px wide on mobile, so 1280px max + 80% JPEG quality
      // keeps Loozers' photos legible while cutting storage to a fraction
      // of the original.
      let blob: Blob = file;
      let ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      try {
        const compressed = await compressImage(file, 1280, 0.8);
        blob = compressed.blob;
        ext = "jpg";
      } catch (err) {
        // Compression failed — fall back to original. Better to send a
        // big file than to lose the message.
        console.warn("Chat image compression failed; uploading original.", err);
      }

      // Pasted/dropped images often have no name (e.g. "image.png" or blank),
      // so fall back to a stable default for the storage key.
      const rawName = file.name && file.name !== "image.png" ? file.name : "pasted-image";
      const baseName = rawName.replace(/\.[^.]+$/, "") || "image";
      const fileName = `${roomId}/${Date.now()}-${baseName}.${ext}`;
      const { data, error } = await supabase.storage
        .from("chat-images")
        .upload(fileName, blob, {
          cacheControl: "3600",
          upsert: false,
          contentType: blob.type || file.type,
        });

      if (error) {
        console.error("Upload error:", error);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("chat-images")
        .getPublicUrl(data.path);

      const content = buildContentWithMentions(text.trim(), pendingMentions);
      await onSend(content, urlData.publicUrl);
      setText("");
      setPendingMentions([]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadAndSendImage(file);
  };

  // Clipboard paste — grab the first image on the clipboard and upload it.
  // Works for phone screenshots and desktop copy-image. Text pastes fall
  // through to the textarea's default handling untouched.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (uploading) return;
    const item = Array.from(e.clipboardData.items).find((it) =>
      it.type.startsWith("image/"),
    );
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void uploadAndSendImage(file);
    }
  };

  // Drag-and-drop from the desktop — same upload path.
  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (uploading) return;
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) {
      e.preventDefault();
      void uploadAndSendImage(file);
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
    <div className="relative border-t border-gray-200 bg-white">
      {/* @mention autocomplete — anchored above the input area. */}
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <div className="absolute left-2 right-2 bottom-full mb-1 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden z-10">
          {mentionMatches.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={(e) => {
                // mousedown (not click) so the textarea doesn't blur
                // before we restore focus inside pickMention.
                e.preventDefault();
                pickMention(m);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                pickMention(m);
              }}
              className={`flex items-center gap-2.5 w-full px-3 py-2 text-left ${
                i === mentionIndex ? "bg-green-50" : "active:bg-gray-50"
              }`}
            >
              {m.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-xs font-bold">
                  {(m.display_name || "?")[0].toUpperCase()}
                </span>
              )}
              <span className="text-sm font-medium text-gray-900">{m.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
          <div className="w-0.5 h-8 bg-green-600 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[0.6875rem] text-green-700 font-medium">
              {replyTo.sender?.display_name || "Unknown"}
            </p>
            <p className="text-xs text-gray-500 truncate">
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
          {/* Camera — `capture` tells iOS/Android to open the camera UI
              directly instead of the photo picker. */}
          <button
            onClick={() => {
              setActivePanel(null);
              if (fileInputRef.current) {
                fileInputRef.current.setAttribute("capture", "environment");
                fileInputRef.current.click();
                fileInputRef.current.removeAttribute("capture");
              }
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
            <span className="text-[0.625rem] text-gray-500 font-medium">Camera</span>
          </button>

          {/* Photos — no `capture` attribute, so the OS shows the gallery. */}
          <button
            onClick={() => {
              setActivePanel(null);
              fileInputRef.current?.click();
            }}
            disabled={uploading}
            className="flex flex-col items-center gap-1 disabled:opacity-50"
          >
            <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="text-[0.625rem] text-gray-500 font-medium">Photos</span>
          </button>

          {/* GIF */}
          <button
            onClick={() => setActivePanel("gif")}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-[0.8125rem]">GIF</span>
            </div>
            <span className="text-[0.625rem] text-gray-500 font-medium">GIFs</span>
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
            <span className="text-[0.625rem] text-gray-500 font-medium">Emoji</span>
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

        {/* Text input bubble — wraps an overlay div + textarea so we can
            render highlight pills behind picked @mentions. The two must
            share identical font, padding, line-height, and white-space
            rules or the highlight will drift. */}
        <div className={`relative flex-1 min-w-0 border border-gray-300 ${text.includes("\n") || text.length > 60 ? "rounded-2xl" : "rounded-full"}`}>
          {/* Highlight overlay — pointer-events-none so it never steals
              touches from the textarea above. Mirrors the textarea's
              scroll position on every input. Visible-text is transparent
              so only the mention spans' backgrounds show through. */}
          <div
            ref={overlayRef}
            aria-hidden="true"
            className="absolute inset-0 m-0 px-4 py-2 text-base whitespace-pre-wrap break-words pointer-events-none overflow-hidden text-transparent"
            style={{ height: "36px" }}
          >
            {(() => {
              if (mentionSpans.length === 0) {
                return <span>{text || "​"}</span>;
              }
              const out: React.ReactNode[] = [];
              let cursor = 0;
              mentionSpans.forEach((s, i) => {
                if (s.start > cursor) out.push(<span key={`t${i}`}>{text.slice(cursor, s.start)}</span>);
                out.push(
                  <span
                    key={`m${i}`}
                    className="bg-green-100 text-green-800 rounded-md"
                    style={{
                      // box-decoration-break keeps the pill rendering
                      // clean if the mention happens to wrap a line.
                      WebkitBoxDecorationBreak: "clone",
                      boxDecorationBreak: "clone",
                    }}
                  >
                    {text.slice(s.start, s.end)}
                  </span>,
                );
                cursor = s.end;
              });
              if (cursor < text.length) {
                out.push(<span key="tend">{text.slice(cursor)}</span>);
              }
              return out;
            })()}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              onTyping();
              // Auto-grow textarea + sync overlay height so the pills
              // stay positioned correctly when the input wraps.
              const el = e.target;
              el.style.height = "36px";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
              if (overlayRef.current) {
                overlayRef.current.style.height = el.style.height;
              }
              updateMentionState(next, el.selectionStart ?? next.length);
            }}
            onScroll={(e) => {
              // Mirror scroll into the overlay so the highlights track
              // the visible text region.
              if (overlayRef.current) {
                overlayRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
            onKeyUp={(e) => {
              const el = e.currentTarget;
              updateMentionState(text, el.selectionStart ?? text.length);
            }}
            onClick={(e) => {
              const el = e.currentTarget;
              updateMentionState(text, el.selectionStart ?? text.length);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onFocus={() => {
              if (activePanel === "menu") setActivePanel(null);
            }}
            placeholder="Message"
            rows={1}
            style={{ backgroundColor: "transparent", height: "36px" }}
            className="relative block w-full m-0 px-4 py-2 text-base text-gray-900 placeholder-gray-400 resize-none outline-none border-none overflow-y-auto bg-transparent"
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
