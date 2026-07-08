"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Comment {
  id: string;
  body: string;
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

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Live comments on a round (issue #140). Self-contained: fetches, posts,
 * deletes, and realtime-refreshes on its own `round-comments:{id}` channel
 * (distinct topic from the scoreboard's `round:{id}` channel). Works on any
 * round regardless of status — no gate.
 */
export function RoundComments({
  roundId,
  currentUserId,
  isAdmin = false,
}: {
  roundId: string;
  currentUserId: string;
  isAdmin?: boolean;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior,
      });
    }, 50);
  };

  const refetch = useCallback(
    (scroll: boolean) => {
      return fetch(`/api/rounds/${roundId}/comments`)
        .then((res) => (res.ok ? res.json() : { comments: [] }))
        .then((data) => {
          setComments(data.comments || []);
          setLoading(false);
          if (scroll) scrollToBottom();
        });
    },
    [roundId]
  );

  useEffect(() => {
    refetch(true);
  }, [refetch]);

  // Realtime — refetch (for enriched sender data) on any comment change.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`round-comments:${roundId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "round_comments",
          filter: `round_id=eq.${roundId}`,
        },
        () => refetch(true)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId, refetch]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const res = await fetch(`/api/rounds/${roundId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setText("");
      scrollToBottom("smooth");
    }
    setSending(false);
  };

  const handleDelete = async (id: string) => {
    // Optimistic removal; realtime/refetch reconciles.
    const prior = comments;
    setComments((prev) => prev.filter((c) => c.id !== id));
    const res = await fetch(`/api/rounds/${roundId}/comments/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) setComments(prior);
  };

  return (
    <div className="flex flex-col">
      <div ref={scrollRef} className="max-h-80 overflow-y-auto px-1 py-2 space-y-3">
        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && comments.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-6">
            No comments yet — say something.
          </p>
        )}

        {comments.map((c) => {
          const canDelete = c.sender_id === currentUserId || isAdmin;
          return (
            <div key={c.id} className="flex gap-2.5 group">
              <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                {c.sender?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.sender.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[0.625rem] font-semibold">
                    {getInitials(c.sender?.display_name || "?")}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {c.sender?.display_name}
                  </span>
                  <span className="text-[0.6875rem] text-gray-400">
                    {formatTime(c.created_at)}
                  </span>
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="ml-auto text-[0.6875rem] text-gray-400 active:text-red-600"
                      aria-label="Delete comment"
                    >
                      Delete
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-700 break-words">{c.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <input
          type="text"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Add a comment..."
          className="flex-1 px-3 py-2 text-base border border-gray-300 rounded-full focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="w-9 h-9 bg-green-600 text-white rounded-full flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform flex-shrink-0"
          aria-label="Send comment"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
