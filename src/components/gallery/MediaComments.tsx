"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { BTN_NEUTRAL } from "@/lib/ui/buttons";
import { DragHandle } from "@/components/DragHandle";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender: { id: string; display_name: string; avatar_url: string | null };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function MediaComments({
  itemId,
  onClose,
}: {
  itemId: string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch comments
  useEffect(() => {
    fetch(`/api/gallery/${itemId}/comments`)
      .then((res) => res.json())
      .then((data) => {
        setComments(data.comments || []);
        setLoading(false);
        // Scroll to bottom
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
          });
        }, 50);
      });
  }, [itemId]);

  // Realtime comments
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`gallery-comments-${itemId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gallery_comments",
          filter: `item_id=eq.${itemId}`,
        },
        () => {
          // Refetch to get enriched data
          fetch(`/api/gallery/${itemId}/comments`)
            .then((res) => res.json())
            .then((data) => {
              setComments(data.comments || []);
              setTimeout(() => {
                scrollRef.current?.scrollTo({
                  top: scrollRef.current!.scrollHeight,
                  behavior: "smooth",
                });
              }, 50);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);

    const res = await fetch(`/api/gallery/${itemId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.trim() }),
    });

    if (res.ok) {
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setText("");
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current!.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }

    setSending(false);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl max-h-[60vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <DragHandle onClose={onClose} className="" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Comments</h3>
          <button onClick={onClose} className={BTN_NEUTRAL}>
            Close
          </button>
        </div>

        {/* Comments list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && comments.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">
              No comments yet
            </p>
          )}

          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.sender?.avatar_url ? (
                  <img
                    src={c.sender.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-semibold">
                    {getInitials(c.sender?.display_name || "?")}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {c.sender?.display_name}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {formatTime(c.created_at)}
                  </span>
                </div>
                <p className="text-sm text-gray-700 break-words">
                  {c.content}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Add a comment..."
            autoFocus
            className="flex-1 px-3 py-2 text-[16px] border border-gray-300 rounded-full focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="w-9 h-9 bg-green-600 text-white rounded-full flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
