"use client";

import { useState, useRef, useCallback, useEffect } from "react";
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

export function MediaViewer({
  items,
  initialIndex,
  currentUserId,
  isAdmin,
  allUsers,
  onClose,
  onDelete,
}: {
  items: GalleryItem[];
  initialIndex: number;
  currentUserId: string;
  isAdmin: boolean;
  allUsers: GalleryUser[];
  onClose: () => void;
  onDelete: (itemId: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showOverlay, setShowOverlay] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const touchStartY = useRef(0);
  const touchDelta = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const item = items[currentIndex];
  if (!item) {
    onClose();
    return null;
  }

  const canDelete = item.uploader_id === currentUserId || isAdmin;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= items.length) return;
      setIsTransitioning(true);
      setSwipeOffset(index > currentIndex ? -window.innerHeight : window.innerHeight);
      setTimeout(() => {
        setCurrentIndex(index);
        setSwipeOffset(0);
        setIsTransitioning(false);
      }, 200);
    },
    [currentIndex, items.length]
  );

  // Touch handlers for vertical swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (showComments || showReactions || showTags) return;
    touchStartY.current = e.touches[0].clientY;
    touchDelta.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (showComments || showReactions || showTags) return;
    e.preventDefault();
    touchDelta.current = e.touches[0].clientY - touchStartY.current;
    setSwipeOffset(touchDelta.current);
  };

  const handleTouchEnd = () => {
    if (showComments || showReactions || showTags) return;
    const threshold = 80;
    if (touchDelta.current < -threshold && currentIndex < items.length - 1) {
      goTo(currentIndex + 1);
    } else if (touchDelta.current > threshold && currentIndex > 0) {
      goTo(currentIndex - 1);
    } else {
      setSwipeOffset(0);
    }
    touchDelta.current = 0;
  };

  const handleTap = (e: React.MouseEvent) => {
    // Only toggle overlay if not clicking on a button
    if ((e.target as HTMLElement).closest("button, a")) return;
    setShowOverlay((prev) => !prev);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp" && currentIndex > 0)
        goTo(currentIndex - 1);
      if (e.key === "ArrowDown" && currentIndex < items.length - 1)
        goTo(currentIndex + 1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [currentIndex, items.length, goTo, onClose]);

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

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Main content area */}
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTap}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translateY(${swipeOffset}px)`,
            transition: isTransitioning ? "transform 0.2s ease-out" : "none",
          }}
        >
          {item.media_type === "video" ? (
            <video
              key={item.id}
              src={item.media_url}
              className="max-w-full max-h-full object-contain"
              controls
              autoPlay
              loop
              playsInline
            />
          ) : (
            <img
              key={item.id}
              src={item.media_url}
              alt={item.caption || ""}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      </div>

      {/* Overlay UI */}
      {showOverlay && (
        <>
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent pt-2 pb-8 px-4">
            <div className="flex items-center justify-between">
              {/* Close button */}
              <button
                onClick={onClose}
                className="w-10 h-10 flex items-center justify-center"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Counter */}
              <span className="text-white/80 text-sm font-medium">
                {currentIndex + 1} / {items.length}
              </span>

              {/* Menu */}
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
                          if (confirm("Delete this item?")) {
                            onDelete(item.id);
                          }
                          setShowMenu(false);
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
            {/* Uploader info */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center overflow-hidden flex-shrink-0">
                {item.uploader.avatar_url ? (
                  <img
                    src={item.uploader.avatar_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-semibold">
                    {(item.uploader.display_name[0] || "?").toUpperCase()}
                  </span>
                )}
              </div>
              <span className="text-white font-medium text-sm">
                {item.uploader.display_name}
              </span>
              <span className="text-white/60 text-xs">
                {formatTime(item.taken_at || item.created_at)}
              </span>
            </div>

            {/* Caption */}
            {item.caption && (
              <p className="text-white text-sm mb-3">{item.caption}</p>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-4">
              {/* Reactions */}
              <button
                onClick={() => setShowReactions(true)}
                className="flex items-center gap-1.5 text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {item.reactionCount > 0 && (
                  <span className="text-sm">{item.reactionCount}</span>
                )}
              </button>

              {/* Comments */}
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center gap-1.5 text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                {item.commentCount > 0 && (
                  <span className="text-sm">{item.commentCount}</span>
                )}
              </button>

              {/* Tagged Loozers */}
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
        <MediaComments
          itemId={item.id}
          onClose={() => setShowComments(false)}
        />
      )}

      {/* Reactions overlay */}
      {showReactions && (
        <MediaReactions
          itemId={item.id}
          reactions={item.reactions}
          onClose={() => setShowReactions(false)}
          onReactionChanged={(newReactions) => {
            // Update item in-place
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
    </div>
  );
}
