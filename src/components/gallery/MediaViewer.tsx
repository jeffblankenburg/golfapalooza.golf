"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { MediaComments } from "./MediaComments";
import { MediaReactions } from "./MediaReactions";
import { TagPicker } from "./TagPicker";

interface GalleryItem {
  id: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: "photo" | "video";
  caption: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  taken_at: string | null;
  sort_date: string;
  trip_id: string | null;
  uploader_id: string;
  uploader: { id: string; display_name: string; avatar_url: string | null };
  reactions: Record<string, { count: number; hasReacted: boolean }>;
  reactionCount: number;
  tags: string[];
  commentCount: number;
}

interface GalleryUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

function getDistance(t1: React.Touch, t2: React.Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

// ─── MediaPanel: renders a single photo or video ────────────────────────────

function MediaPanel({
  item,
  isActive,
  isMuted,
  videoRefCallback,
  onZoomChange,
}: {
  item: GalleryItem;
  isActive: boolean;
  isMuted: boolean;
  videoRefCallback: (id: string, el: HTMLVideoElement | null) => void;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [videoLoading, setVideoLoading] = useState(false);

  // Pinch-to-zoom state (photos only)
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

  // Reset zoom when panel becomes inactive
  useEffect(() => {
    if (!isActive) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      onZoomChange(false);
    }
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

  // ─── Photo with pinch-to-zoom ───────────────────────────────────────────

  const handlePhotoTouchStart = (e: React.TouchEvent) => {
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

  const handlePhotoTouchMove = (e: React.TouchEvent) => {
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

  const handlePhotoTouchEnd = (e: React.TouchEvent) => {
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
    if (g.isPanning && e.touches.length === 0) {
      g.isPanning = false;
    }
  };

  const hasAspectRatio = item.width && item.height;

  return (
    <div
      className="relative flex items-center justify-center w-full h-full"
      onTouchStart={handlePhotoTouchStart}
      onTouchMove={handlePhotoTouchMove}
      onTouchEnd={handlePhotoTouchEnd}
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
          className={
            hasAspectRatio
              ? "w-full h-full object-contain"
              : "max-w-full max-h-full object-contain"
          }
        />
      </div>
    </div>
  );
}

// ─── MediaViewer ────────────────────────────────────────────────────────────

export function MediaViewer({
  items,
  initialIndex,
  currentUserId,
  isAdmin,
  allUsers,
  onClose,
  onDelete,
  initialShowComments = false,
}: {
  items: GalleryItem[];
  initialIndex: number;
  currentUserId: string;
  isAdmin: boolean;
  allUsers: GalleryUser[];
  onClose: () => void;
  onDelete: (itemId: string) => void;
  initialShowComments?: boolean;
}) {
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
  const [, forceRender] = useState(0);

  // Swipe state
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const touchStartY = useRef(0);
  const touchDelta = useRef(0);
  const touchFingers = useRef(0);
  const playPauseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastTapTime = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const heartIdRef = useRef(0);

  // Video ref map
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const videoRefCallback = useCallback((id: string, el: HTMLVideoElement | null) => {
    if (el) {
      videoRefs.current[id] = el;
      // Set initial muted state imperatively (required for autoplay on iOS)
      el.muted = isMutedRef.current;
    } else {
      delete videoRefs.current[id];
    }
  }, []);

  const handleZoomChange = useCallback((zoomed: boolean) => {
    setIsZoomed(zoomed);
  }, []);

  const item = items[currentIndex];
  if (!item) {
    onClose();
    return null;
  }

  const canDelete = item.uploader_id === currentUserId || isAdmin;
  const drawerOpen = showComments || showReactions || showTags;

  // The 3 panels to render: prev, current, next
  const panels = useMemo(() => {
    const result: { item: GalleryItem; position: number }[] = [];
    if (currentIndex > 0) {
      result.push({ item: items[currentIndex - 1], position: -1 });
    }
    result.push({ item: items[currentIndex], position: 0 });
    if (currentIndex < items.length - 1) {
      result.push({ item: items[currentIndex + 1], position: 1 });
    }
    return result;
  }, [currentIndex, items]);

  // ─── Video playback management ──────────────────────────────────────────
  useEffect(() => {
    const activeItem = items[currentIndex];
    for (const [id, videoEl] of Object.entries(videoRefs.current)) {
      if (!videoEl) continue;
      if (id === activeItem?.id) {
        videoEl.muted = isMuted;
        const playPromise = videoEl.play();
        if (playPromise) {
          playPromise.catch(() => {
            videoEl.muted = true;
            videoEl.play().catch(() => {});
          });
        }
      } else {
        videoEl.pause();
      }
    }
    setIsPaused(false);
  }, [currentIndex, items, isMuted]);

  // ─── Mute toggle: apply to all mounted videos ────────────────────────
  const toggleMute = useCallback(() => {
    setIsMuted((m) => {
      const next = !m;
      for (const videoEl of Object.values(videoRefs.current)) {
        if (videoEl) videoEl.muted = next;
      }
      return next;
    });
  }, []);

  // ─── Soft prefetch items 2-3 ahead ──────────────────────────────────────
  useEffect(() => {
    const indices = [currentIndex - 2, currentIndex - 3, currentIndex + 2, currentIndex + 3];
    const cleanup: (() => void)[] = [];

    for (const idx of indices) {
      const adj = items[idx];
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
  }, [currentIndex, items]);

  // ─── Like toggle (double-tap) ───────────────────────────────────────────

  const toggleLike = (tapX: number, tapY: number) => {
    const heartEmoji = "\u2764\uFE0F";
    const currentItem = items[currentIndex];
    const currentReaction = currentItem.reactions[heartEmoji];
    const isLiked = currentReaction?.hasReacted ?? false;

    const newReactions = { ...currentItem.reactions };
    let newReactionCount = currentItem.reactionCount;

    if (isLiked) {
      if (currentReaction.count <= 1) {
        delete newReactions[heartEmoji];
      } else {
        newReactions[heartEmoji] = { count: currentReaction.count - 1, hasReacted: false };
      }
      newReactionCount--;
    } else {
      newReactions[heartEmoji] = {
        count: (currentReaction?.count ?? 0) + 1,
        hasReacted: true,
      };
      newReactionCount++;
      // Heart animation (only when liking)
      const id = heartIdRef.current++;
      setHeartAnimations((prev) => [...prev, { id, x: tapX, y: tapY }]);
      setTimeout(() => {
        setHeartAnimations((prev) => prev.filter((h) => h.id !== id));
      }, 800);
    }

    items[currentIndex] = { ...currentItem, reactions: newReactions, reactionCount: newReactionCount };
    forceRender((v) => v + 1);

    // Fire-and-forget API call
    fetch(`/api/gallery/${currentItem.id}/reactions`, {
      method: isLiked ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji: heartEmoji }),
    }).catch(() => {});
  };

  // ─── Touch handlers ────────────────────────────────────────────────────

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

    // Rubber-band at edges
    const atStart = currentIndex === 0 && delta > 0;
    const atEnd = currentIndex === items.length - 1 && delta < 0;
    if (atStart || atEnd) {
      setSwipeOffset(delta * 0.3);
    } else {
      setSwipeOffset(delta);
    }
  };

  const handleTouchEnd = () => {
    if (drawerOpen || isSettling) return;
    if (touchFingers.current >= 2 || isZoomed) {
      touchFingers.current = 0;
      return;
    }
    touchFingers.current = 0;
    const threshold = 80;
    const delta = touchDelta.current;

    const atStart = currentIndex === 0 && delta > 0;
    const atEnd = currentIndex === items.length - 1 && delta < 0;

    if (!atStart && !atEnd && Math.abs(delta) > threshold) {
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

  // ─── Tap handler with double-tap detection ──────────────────────────────

  const handleTap = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, a")) return;
    if (isZoomed) return;

    const now = Date.now();
    const isDoubleTap = now - lastTapTime.current < 300;
    lastTapTime.current = now;

    if (item.media_type === "video") {
      // Single tap: immediate play/pause (no delay)
      const videoEl = videoRefs.current[item.id];
      if (videoEl) {
        if (videoEl.paused) {
          videoEl.play();
          setIsPaused(false);
        } else {
          videoEl.pause();
          setIsPaused(true);
        }
        clearTimeout(playPauseTimer.current);
        setShowPlayPauseIcon(true);
        playPauseTimer.current = setTimeout(() => setShowPlayPauseIcon(false), 600);
      }
      // Double tap: also toggle like
      if (isDoubleTap) {
        toggleLike(e.clientX, e.clientY);
      }
    } else {
      // Photo: delay single-tap, detect double-tap
      if (isDoubleTap) {
        clearTimeout(singleTapTimer.current);
        toggleLike(e.clientX, e.clientY);
      } else {
        singleTapTimer.current = setTimeout(() => {
          setShowOverlay((prev) => !prev);
        }, 300);
      }
    }
  };

  // ─── Keyboard navigation ───────────────────────────────────────────────

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length || isSettling) return;
      const direction = index > currentIndex ? -1 : 1;
      setIsSettling(true);
      setSwipeOffset(direction * window.innerHeight);
      setTimeout(() => {
        setCurrentIndex(index);
        setSwipeOffset(0);
        setIsSettling(false);
      }, 300);
    },
    [currentIndex, items.length, isSettling]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp" && currentIndex > 0) goTo(currentIndex - 1);
      if (e.key === "ArrowDown" && currentIndex < items.length - 1) goTo(currentIndex + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, items.length, goTo, onClose]);

  // ─── Helpers ──────────────────────────────────────────────────────────

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Heart animation keyframes */}
      <style>{`
        @keyframes heart-pop {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
          15% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
          30% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          80% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -60%) scale(1); opacity: 0; }
        }
      `}</style>

      {/* 3-panel swipe area */}
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
                isMuted={isMuted}
                videoRefCallback={videoRefCallback}
                onZoomChange={handleZoomChange}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Heart animations */}
      {heartAnimations.map((heart) => (
        <div
          key={heart.id}
          className="fixed pointer-events-none z-30 text-red-500"
          style={{
            left: heart.x,
            top: heart.y,
            fontSize: "80px",
            animation: "heart-pop 0.8s ease-out forwards",
          }}
        >
          {"\u2764\uFE0F"}
        </div>
      ))}

      {/* Play/pause indicator (for current video) */}
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

      {/* Overlay UI */}
      {showOverlay && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent pt-2 pb-8 px-4">
            <div className="flex items-center justify-between">
              <button onClick={onClose} className="w-10 h-10 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <span className="text-white/80 text-sm font-medium">
                {currentIndex + 1} / {items.length}
              </span>

              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="w-10 h-10 flex items-center justify-center"
                >
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

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/60 to-transparent pb-6 pt-12 px-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center overflow-hidden flex-shrink-0">
                {item.uploader.avatar_url ? (
                  <img src={item.uploader.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[0.625rem] font-semibold">
                    {(item.uploader.display_name[0] || "?").toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-white font-medium text-sm">{item.uploader.display_name}</span>
              <span className="text-white/60 text-xs">{formatTime(item.taken_at || item.created_at)}</span>
            </div>

            {editingCaption ? (
              <form
                className="flex gap-2 mb-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const newCaption = captionDraft.trim() || null;
                  items[currentIndex] = { ...item, caption: newCaption };
                  setEditingCaption(false);
                  forceRender((v) => v + 1);
                  await fetch(`/api/gallery/${item.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ caption: newCaption }),
                  });
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

      {/* Comments drawer */}
      {showComments && (
        <MediaComments itemId={item.id} onClose={() => setShowComments(false)} />
      )}

      {/* Reactions overlay */}
      {showReactions && (
        <MediaReactions
          itemId={item.id}
          reactions={item.reactions}
          onClose={() => setShowReactions(false)}
          onReactionChanged={(newReactions) => {
            items[currentIndex] = { ...item, reactions: newReactions };
          }}
        />
      )}

      {/* Tag picker */}
      {showTags && (
        <TagPicker
          itemId={item.id}
          allUsers={allUsers}
          existingTags={item.tags}
          onClose={() => setShowTags(false)}
          onTagsChanged={(newTags) => {
            items[currentIndex] = { ...item, tags: newTags };
          }}
        />
      )}

      {/* Delete confirmation modal */}
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
                onClick={() => {
                  setConfirmDelete(false);
                  onDelete(items[currentIndex].id);
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
