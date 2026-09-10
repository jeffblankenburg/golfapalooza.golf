"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
/* eslint-disable @next/next/no-img-element */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ViewerItem {
  id: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: "photo" | "video";
  caption: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  taken_at: string | null;
  uploader_id: string;
  uploader: { display_name: string; avatar_url: string | null };
  reactions: Record<string, { count: number; hasReacted: boolean }>;
  reactionCount: number;
  tags: string[];
  commentCount: number;
}

export interface ViewerUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}
function getDistance(t1: React.Touch, t2: React.Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}
// Short stamp for comment rows (now / 5m / 3h / Mar 4).
function commentStamp(s: string, now = new Date()): string {
  const mins = Math.floor((now.getTime() - new Date(s).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
// Longer stamp for the uploader line (Just now / 5m ago / … / date).
function mediaStamp(s: string, now = new Date()): string {
  const mins = Math.floor((now.getTime() - new Date(s).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(s).toLocaleDateString();
}
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

// Inline close handle for the bottom sheets (avoids importing legacy DragHandle).
function SheetHandle({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" onClick={onClose} aria-label="Close" className="block w-full py-2">
      <span className="block w-10 h-1 bg-gray-300 rounded-full mx-auto" />
    </button>
  );
}

// ─── MediaPanel: a single photo (pinch-zoom) or video ────────────────────────

function MediaPanel({
  item,
  isActive,
  videoRefCallback,
  onZoomChange,
}: {
  item: ViewerItem;
  isActive: boolean;
  videoRefCallback: (id: string, el: HTMLVideoElement | null) => void;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [videoLoading, setVideoLoading] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSnapBack, setIsSnapBack] = useState(false);
  const gestureRef = useRef({
    isPinching: false,
    isPanning: false,
    initialDist: 0,
    initialScale: 1,
    initialOffset: { x: 0, y: 0 },
    initialMid: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    panStartOffset: { x: 0, y: 0 },
  });

  useEffect(() => {
    if (isActive) return;
    const raf = requestAnimationFrame(() => {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      onZoomChange(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [isActive, onZoomChange]);

  if (item.media_type === "video") {
    return (
      <>
        <video
          ref={(el) => videoRefCallback(item.id, el)}
          src={item.media_url}
          poster={item.thumbnail_url || undefined}
          className="max-w-full max-h-full object-contain"
          autoPlay={isActive}
          loop
          playsInline
          preload="auto"
          onWaiting={() => setVideoLoading(true)}
          onPlaying={() => setVideoLoading(false)}
          onCanPlay={() => setVideoLoading(false)}
        />
        {videoLoading && isActive && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </>
    );
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (e.touches.length === 2) {
      e.stopPropagation();
      g.isPinching = true;
      g.isPanning = false;
      g.initialDist = getDistance(e.touches[0], e.touches[1]);
      g.initialScale = scale;
      g.initialOffset = { x: offset.x, y: offset.y };
      g.initialMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      setIsSnapBack(false);
      onZoomChange(true);
    } else if (e.touches.length === 1 && scale > 1) {
      e.stopPropagation();
      g.isPanning = true;
      g.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      g.panStartOffset = { x: offset.x, y: offset.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (g.isPinching && e.touches.length >= 2) {
      e.stopPropagation();
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const newScale = Math.min(4, Math.max(1, g.initialScale * (dist / g.initialDist)));
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      setScale(newScale);
      setOffset({
        x: g.initialOffset.x + (mid.x - g.initialMid.x),
        y: g.initialOffset.y + (mid.y - g.initialMid.y),
      });
    } else if (g.isPanning && e.touches.length === 1) {
      e.stopPropagation();
      e.preventDefault();
      setOffset({
        x: g.panStartOffset.x + (e.touches[0].clientX - g.panStart.x),
        y: g.panStartOffset.y + (e.touches[0].clientY - g.panStart.y),
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const g = gestureRef.current;
    if (g.isPinching && e.touches.length < 2) {
      g.isPinching = false;
      if (scale < 1.1) {
        setIsSnapBack(true);
        setScale(1);
        setOffset({ x: 0, y: 0 });
        onZoomChange(false);
        setTimeout(() => setIsSnapBack(false), 200);
      }
    }
    if (g.isPanning && e.touches.length === 0) g.isPanning = false;
  };

  const hasAspectRatio = item.width && item.height;

  return (
    <div
      className="relative flex items-center justify-center w-full h-full"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: isSnapBack ? "transform 0.2s ease-out" : "none",
          ...(hasAspectRatio
            ? { aspectRatio: `${item.width}/${item.height}`, width: "100vw", maxWidth: "100vw", maxHeight: "100dvh" }
            : {}),
        }}
        className={hasAspectRatio ? "relative" : "relative flex items-center justify-center"}
      >
        <img
          src={item.media_url}
          alt={item.caption || ""}
          className={hasAspectRatio ? "w-full h-full object-contain" : "max-w-full max-h-full object-contain"}
        />
      </div>
    </div>
  );
}

// ─── Reactions overlay ───────────────────────────────────────────────────────

const EMOJI_OPTIONS = [
  { emoji: "❤️", label: "Love" },
  { emoji: "👍", label: "Thumbs up" },
  { emoji: "👎", label: "Thumbs down" },
  { emoji: "😂", label: "Haha" },
  { emoji: "❗️", label: "Exclamation" },
  { emoji: "❓", label: "Question" },
];

function ReactionsSheet({
  itemId,
  reactions,
  onClose,
  onReactionChanged,
}: {
  itemId: string;
  reactions: Record<string, { count: number; hasReacted: boolean }>;
  onClose: () => void;
  onReactionChanged: (r: Record<string, { count: number; hasReacted: boolean }>) => void;
}) {
  const [local, setLocal] = useState(reactions);

  const toggle = async (emoji: string) => {
    const current = local[emoji];
    const hasReacted = current?.hasReacted || false;
    const updated = { ...local };
    if (hasReacted) {
      if (current.count <= 1) delete updated[emoji];
      else updated[emoji] = { count: current.count - 1, hasReacted: false };
    } else {
      updated[emoji] = { count: (current?.count || 0) + 1, hasReacted: true };
    }
    setLocal(updated);
    onReactionChanged(updated);
    await fetch(`/api/v2/gallery/${itemId}/reactions`, {
      method: hasReacted ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }).catch(() => {});
  };

  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center pb-32" onClick={onClose}>
      <div
        className="bg-white/95 backdrop-blur rounded-2xl px-3 py-2 flex items-center gap-1 shadow-lg animate-tapback-pop"
        onClick={(e) => e.stopPropagation()}
      >
        {EMOJI_OPTIONS.map(({ emoji, label }) => {
          const r = local[emoji];
          const has = r?.hasReacted || false;
          return (
            <button
              key={emoji}
              onClick={() => toggle(emoji)}
              title={label}
              className={`relative flex items-center justify-center w-11 h-11 rounded-full active:scale-90 transition-transform ${
                has ? "bg-green-100" : "hover:bg-gray-100"
              }`}
            >
              <span className="text-2xl">{emoji}</span>
              {r && r.count > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] bg-green-600 text-white text-[0.625rem] font-bold rounded-full flex items-center justify-center px-1">
                  {r.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Comments drawer ─────────────────────────────────────────────────────────

interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  sender: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;
}

function CommentsSheet({ itemId, onClose, onCountChange }: { itemId: string; onClose: () => void; onCountChange: (n: number) => void }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBottom = useCallback((smooth = false) => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    }, 50);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v2/gallery/${itemId}/comments`);
      const d = res.ok ? await res.json() : { comments: [] };
      if (cancelled) return;
      setComments(d.comments || []);
      setLoading(false);
      onCountChange((d.comments || []).length);
      scrollBottom();
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, scrollBottom, onCountChange]);

  useEffect(() => {
    const supabase = v2BrowserClient();
    const channel = supabase
      .channel(`v2-gallery-comments-${itemId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "v2_gallery_comments", filter: `item_id=eq.${itemId}` },
        async () => {
          const res = await fetch(`/api/v2/gallery/${itemId}/comments`);
          const d = res.ok ? await res.json() : { comments: [] };
          setComments(d.comments || []);
          onCountChange((d.comments || []).length);
          scrollBottom(true);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId, scrollBottom, onCountChange]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await fetch(`/api/v2/gallery/${itemId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.trim() }),
    });
    if (res.ok) {
      const d = await res.json();
      setComments((prev) => {
        const next = [...prev, d.comment];
        onCountChange(next.length);
        return next;
      });
      setText("");
      scrollBottom(true);
    }
    setSending(false);
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" onClick={onClose}>
      <div className="bg-white rounded-t-2xl max-h-[60vh] flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center pt-1">
          <SheetHandle onClose={onClose} />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Comments</h3>
          <button onClick={onClose} className="text-sm font-semibold text-gray-500 px-2 py-1">
            Close
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && comments.length === 0 && <p className="text-center text-gray-400 text-sm py-8">No comments yet</p>}
          {comments.map((c) => {
            const s = one(c.sender);
            return (
              <div key={c.id} className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {s?.avatar_url ? (
                    <img src={s.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[0.625rem] font-semibold">{getInitials(s?.display_name || "?")}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-gray-900">{s?.display_name}</span>
                    <span className="text-[0.6875rem] text-gray-400">{commentStamp(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 break-words">{c.content}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Add a comment..."
            autoFocus
            className="flex-1 px-3 py-2 text-base border border-gray-300 rounded-full focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
          />
          <button
            onClick={send}
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

// ─── Tag picker ──────────────────────────────────────────────────────────────

function TagSheet({
  itemId,
  allUsers,
  existingTags,
  onClose,
  onTagsChanged,
}: {
  itemId: string;
  allUsers: ViewerUser[];
  existingTags: string[];
  onClose: () => void;
  onTagsChanged: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(existingTags));
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search
    ? allUsers.filter((u) => u.display_name.toLowerCase().includes(search.toLowerCase()))
    : allUsers;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    const newTags = [...selected].filter((id) => !existingTags.includes(id));
    const removed = existingTags.filter((id) => !selected.has(id));
    if (newTags.length) {
      await fetch(`/api/v2/gallery/${itemId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: newTags }),
      }).catch(() => {});
    }
    for (const userId of removed) {
      await fetch(`/api/v2/gallery/${itemId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(() => {});
    }
    onTagsChanged([...selected]);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl animate-slide-up max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-1">
          <SheetHandle onClose={onClose} />
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-lg font-bold text-gray-900">Tag Loozers</h2>
          <button onClick={onClose} className="text-gray-500 text-sm font-medium">
            Skip
          </button>
        </div>
        <div className="px-4 pb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            autoFocus
            className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4">
          {filtered.map((user) => (
            <button
              key={user.id}
              onClick={() => toggle(user.id)}
              className="flex items-center gap-3 w-full py-2.5 border-b border-gray-100"
            >
              <div
                className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                  selected.has(user.id) ? "bg-green-600 border-green-600" : "border-gray-300"
                }`}
              >
                {selected.has(user.id) && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="w-8 h-8 rounded-full bg-green-700 text-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[0.6875rem] font-semibold">{getInitials(user.display_name)}</span>
                )}
              </div>
              <span className="text-sm font-medium text-gray-900">{user.display_name}</span>
            </button>
          ))}
        </div>
        <div className="px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] border-t border-gray-200">
          <button
            onClick={save}
            disabled={saving}
            className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving ? "Saving..." : selected.size > 0 ? `Tag ${selected.size} Loozer${selected.size !== 1 ? "s" : ""}` : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MediaViewer ─────────────────────────────────────────────────────────────

export default function MediaViewer({
  items,
  initialIndex,
  userId,
  isAdmin,
  allUsers,
  onClose,
  onDelete,
  initialShowComments = false,
}: {
  items: ViewerItem[];
  initialIndex: number;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  allUsers: ViewerUser[];
  onClose: () => void;
  onDelete: (itemId: string) => void;
  initialShowComments?: boolean;
}) {
  // Internal, mutable copy so reaction/tag/caption edits survive parent re-renders.
  const [list, setList] = useState<ViewerItem[]>(items);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showComments, setShowComments] = useState(initialShowComments);
  const [showReactions, setShowReactions] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [isMuted, setIsMuted] = useState(true);
  const [showPlayPauseIcon, setShowPlayPauseIcon] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [heartAnimations, setHeartAnimations] = useState<{ id: number; x: number; y: number }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSettling, setIsSettling] = useState(false);
  const touchStartY = useRef(0);
  const touchDelta = useRef(0);
  const touchFingers = useRef(0);
  const playPauseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTapTime = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heartIdRef = useRef(0);

  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const isMutedRef = useRef(isMuted);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const videoRefCallback = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) {
      videoRefs.current[id] = el;
      el.muted = isMutedRef.current;
    } else {
      delete videoRefs.current[id];
    }
  }, []);

  const handleZoomChange = useCallback((zoomed: boolean) => setIsZoomed(zoomed), []);

  const mutateItem = useCallback((index: number, patch: Partial<ViewerItem>) => {
    setList((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }, []);

  const item = list[currentIndex];

  useEffect(() => {
    if (!item) onClose();
  }, [item, onClose]);

  const canDelete = !!item && (item.uploader_id === userId || isAdmin);
  const drawerOpen = showComments || showReactions || showTags;

  const panels = useMemo(() => {
    const result: { item: ViewerItem; position: number }[] = [];
    if (currentIndex > 0) result.push({ item: list[currentIndex - 1], position: -1 });
    if (list[currentIndex]) result.push({ item: list[currentIndex], position: 0 });
    if (currentIndex < list.length - 1) result.push({ item: list[currentIndex + 1], position: 1 });
    return result;
  }, [currentIndex, list]);

  // Video playback management.
  useEffect(() => {
    const active = list[currentIndex];
    for (const [id, el] of Object.entries(videoRefs.current)) {
      if (!el) continue;
      if (id === active?.id) {
        el.muted = isMuted;
        const p = el.play();
        if (p) p.catch(() => {
          el.muted = true;
          el.play().catch(() => {});
        });
      } else {
        el.pause();
      }
    }
    const raf = requestAnimationFrame(() => setIsPaused(false));
    return () => cancelAnimationFrame(raf);
  }, [currentIndex, list, isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      const next = !m;
      for (const el of Object.values(videoRefs.current)) if (el) el.muted = next;
      return next;
    });
  }, []);

  // Soft-prefetch neighbours.
  useEffect(() => {
    const cleanup: (() => void)[] = [];
    for (const idx of [currentIndex - 2, currentIndex - 3, currentIndex + 2, currentIndex + 3]) {
      const adj = list[idx];
      if (!adj) continue;
      if (adj.media_type === "video") {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "fetch";
        link.href = adj.media_url;
        document.head.appendChild(link);
        cleanup.push(() => link.remove());
      } else {
        const img = new Image();
        img.src = adj.media_url;
      }
    }
    return () => cleanup.forEach((fn) => fn());
  }, [currentIndex, list]);

  const toggleLike = (tapX: number, tapY: number) => {
    const heart = "❤️";
    const cur = list[currentIndex];
    if (!cur) return;
    const r = cur.reactions[heart];
    const isLiked = r?.hasReacted ?? false;
    const reactions = { ...cur.reactions };
    let count = cur.reactionCount;
    if (isLiked) {
      if (r.count <= 1) delete reactions[heart];
      else reactions[heart] = { count: r.count - 1, hasReacted: false };
      count--;
    } else {
      reactions[heart] = { count: (r?.count ?? 0) + 1, hasReacted: true };
      count++;
      const id = heartIdRef.current++;
      setHeartAnimations((prev) => [...prev, { id, x: tapX, y: tapY }]);
      setTimeout(() => setHeartAnimations((prev) => prev.filter((h) => h.id !== id)), 800);
    }
    mutateItem(currentIndex, { reactions, reactionCount: count });
    fetch(`/api/v2/gallery/${cur.id}/reactions`, {
      method: isLiked ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji: heart }),
    }).catch(() => {});
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (drawerOpen || isSettling) return;
    touchFingers.current = e.touches.length;
    if (e.touches.length >= 2 || isZoomed) return;
    touchStartY.current = e.touches[0].clientY;
    touchDelta.current = 0;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (drawerOpen || isSettling) return;
    if (e.touches.length >= 2 || isZoomed) return;
    e.preventDefault();
    const delta = e.touches[0].clientY - touchStartY.current;
    touchDelta.current = delta;
    const atStart = currentIndex === 0 && delta > 0;
    const atEnd = currentIndex === list.length - 1 && delta < 0;
    setSwipeOffset(atStart || atEnd ? delta * 0.3 : delta);
  };
  const handleTouchEnd = () => {
    if (drawerOpen || isSettling) return;
    if (touchFingers.current >= 2 || isZoomed) {
      touchFingers.current = 0;
      return;
    }
    touchFingers.current = 0;
    const delta = touchDelta.current;
    const atStart = currentIndex === 0 && delta > 0;
    const atEnd = currentIndex === list.length - 1 && delta < 0;
    if (!atStart && !atEnd && Math.abs(delta) > 80) {
      const direction = delta < 0 ? -1 : 1;
      setIsSettling(true);
      setSwipeOffset(direction * window.innerHeight);
      setTimeout(() => {
        setCurrentIndex((prev) => prev - direction);
        setSwipeOffset(0);
        setIsSettling(false);
        setEditingCaption(false);
      }, 300);
    } else {
      setIsSettling(true);
      setSwipeOffset(0);
      setTimeout(() => setIsSettling(false), 300);
    }
    touchDelta.current = 0;
  };

  const handleTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a, input, form")) return;
    if (isZoomed || !item) return;
    const now = Date.now();
    const isDouble = now - lastTapTime.current < 300;
    lastTapTime.current = now;
    if (item.media_type === "video") {
      const el = videoRefs.current[item.id];
      if (el) {
        if (el.paused) {
          el.play();
          setIsPaused(false);
        } else {
          el.pause();
          setIsPaused(true);
        }
        clearTimeout(playPauseTimer.current);
        setShowPlayPauseIcon(true);
        playPauseTimer.current = setTimeout(() => setShowPlayPauseIcon(false), 600);
      }
      if (isDouble) toggleLike(e.clientX, e.clientY);
    } else {
      if (isDouble) {
        clearTimeout(singleTapTimer.current);
        toggleLike(e.clientX, e.clientY);
      } else {
        singleTapTimer.current = setTimeout(() => setShowOverlay((v) => !v), 300);
      }
    }
  };

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= list.length || isSettling) return;
      const direction = index > currentIndex ? -1 : 1;
      setIsSettling(true);
      setSwipeOffset(direction * window.innerHeight);
      setTimeout(() => {
        setCurrentIndex(index);
        setSwipeOffset(0);
        setIsSettling(false);
      }, 300);
    },
    [currentIndex, list.length, isSettling],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp" && currentIndex > 0) goTo(currentIndex - 1);
      if (e.key === "ArrowDown" && currentIndex < list.length - 1) goTo(currentIndex + 1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [currentIndex, list.length, goTo, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black overflow-hidden">
      <style>{`
        @keyframes heart-pop {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          15% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
          30% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -60%) scale(1); opacity: 0; }
        }
      `}</style>

      <div
        className="absolute inset-0 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translateY(${swipeOffset}px)`,
            transition: isSettling ? "transform 0.3s ease-out" : "none",
          }}
        >
          {panels.map(({ item: panelItem, position }) => (
            <div
              key={panelItem.id}
              className="absolute inset-0 flex items-center justify-center"
              style={{ transform: `translateY(${position * 100}dvh)` }}
            >
              <MediaPanel
                item={panelItem}
                isActive={position === 0}
                videoRefCallback={videoRefCallback}
                onZoomChange={handleZoomChange}
              />
            </div>
          ))}
        </div>
      </div>

      {heartAnimations.map((h) => (
        <div
          key={h.id}
          className="fixed pointer-events-none z-30 text-red-500"
          style={{ left: h.x, top: h.y, fontSize: "80px", animation: "heart-pop 0.8s ease-out forwards" }}
        >
          {"❤️"}
        </div>
      ))}

      {showPlayPauseIcon && item.media_type === "video" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center animate-pulse">
            {isPaused ? (
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </div>
        </div>
      )}

      {showOverlay && (
        <>
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent pt-2 pb-8 px-4">
            <div className="flex items-center justify-between">
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <span className="text-white/80 text-sm font-medium">
                {currentIndex + 1} / {list.length}
              </span>
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="w-10 h-10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                  </svg>
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg overflow-hidden min-w-[160px]">
                    <button
                      onClick={() => {
                        setShowTags(true);
                        setShowMenu(false);
                      }}
                      className="w-full px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                      Tag Loozers
                    </button>
                    {canDelete && (
                      <button
                        onClick={() => {
                          setCaptionDraft(item.caption || "");
                          setEditingCaption(true);
                          setShowMenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50 border-t border-gray-100"
                      >
                        Edit Caption
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setConfirmDelete(true);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 hover:bg-gray-50 border-t border-gray-100"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/60 to-transparent pb-6 pt-12 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center overflow-hidden flex-shrink-0">
                {item.uploader.avatar_url ? (
                  <img src={item.uploader.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[0.625rem] font-semibold">{(item.uploader.display_name[0] || "?").toUpperCase()}</span>
                )}
              </div>
              <span className="text-white font-medium text-sm">{item.uploader.display_name}</span>
              <span className="text-white/60 text-xs">{mediaStamp(item.taken_at || item.created_at)}</span>
            </div>

            {editingCaption ? (
              <form
                className="flex gap-2 mb-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const newCaption = captionDraft.trim() || null;
                  mutateItem(currentIndex, { caption: newCaption });
                  setEditingCaption(false);
                  await fetch(`/api/v2/gallery/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ caption: newCaption }),
                  }).catch(() => {});
                }}
              >
                <input
                  type="text"
                  value={captionDraft}
                  onChange={(e) => setCaptionDraft(e.target.value)}
                  placeholder="Add a caption..."
                  autoFocus
                  className="flex-1 px-3 py-1.5 text-sm bg-white/20 text-white placeholder-white/50 rounded-lg border border-white/30 outline-none focus:border-white/60"
                />
                <button type="submit" className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCaption(false)}
                  className="px-3 py-1.5 bg-white/20 text-white text-sm font-medium rounded-lg"
                >
                  Cancel
                </button>
              </form>
            ) : (
              item.caption && <p className="text-white text-sm mb-3">{item.caption}</p>
            )}

            <div className="flex items-center gap-4">
              {item.media_type === "video" && (
                <button onClick={toggleMute} className="flex items-center text-white">
                  {isMuted ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>
              )}

              <button onClick={() => setShowReactions(true)} className="flex items-center gap-1.5 text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {item.reactionCount > 0 && <span className="text-sm">{item.reactionCount}</span>}
              </button>

              <button onClick={() => setShowComments(true)} className="flex items-center gap-1.5 text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {item.commentCount > 0 && <span className="text-sm">{item.commentCount}</span>}
              </button>

              {item.tags.length > 0 && (
                <div className="flex items-center gap-1.5 text-white/70 text-xs">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>
                    {item.tags
                      .map((id) => allUsers.find((u) => u.id === id)?.display_name)
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {showComments && (
        <CommentsSheet
          itemId={item.id}
          onClose={() => setShowComments(false)}
          onCountChange={(n) => mutateItem(currentIndex, { commentCount: n })}
        />
      )}

      {showReactions && (
        <ReactionsSheet
          itemId={item.id}
          reactions={item.reactions}
          onClose={() => setShowReactions(false)}
          onReactionChanged={(reactions) =>
            mutateItem(currentIndex, {
              reactions,
              reactionCount: Object.values(reactions).reduce((s, r) => s + r.count, 0),
            })
          }
        />
      )}

      {showTags && (
        <TagSheet
          itemId={item.id}
          allUsers={allUsers}
          existingTags={item.tags}
          onClose={() => setShowTags(false)}
          onTagsChanged={(tags) => mutateItem(currentIndex, { tags })}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl p-6 mx-6 max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Delete this item?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl active:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirmDelete(false);
                  const id = item.id;
                  onDelete(id);
                  setList((prev) => prev.filter((it) => it.id !== id));
                  await fetch(`/api/v2/gallery/${id}`, { method: "DELETE" }).catch(() => {});
                }}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl active:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
