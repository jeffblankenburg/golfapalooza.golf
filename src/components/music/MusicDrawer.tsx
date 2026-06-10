"use client";

import { useEffect, useRef, useState } from "react";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { MusicPage } from "@/components/music/MusicPage";

/**
 * Universal music drawer. Mounted once at app shell level via
 * MusicPlayerProvider. Three render states:
 *   - Hidden: no music has played AND drawer hasn't been opened manually.
 *   - Collapsed: a thin mini-player strip above the bottom nav.
 *   - Expanded: full-screen overlay holding the full MusicPage UI.
 *
 * Music keeps playing across navigation in all states; the underlying
 * <audio> element lives in MusicPlayerProvider.
 */
export function MusicDrawer() {
  const {
    songs,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    isVisible,
    isDrawerExpanded,
    togglePlayPause,
    next,
    previous,
    expandDrawer,
    collapseDrawer,
  } = useMusicPlayer();

  // Drag-to-collapse on the expanded drawer header.
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  // Lock background scroll while expanded (matches BottomDrawer pattern).
  useEffect(() => {
    if (!isDrawerExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isDrawerExpanded]);

  if (!isVisible || songs.length === 0) return null;

  const currentSong = songs[currentIndex];
  if (!currentSong) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  function onHandleTouchStart(e: React.TouchEvent) {
    dragStartYRef.current = e.touches[0].clientY;
  }
  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartYRef.current == null) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    if (dy > 0) setDragOffset(dy);
  }
  function onHandleTouchEnd() {
    const start = dragStartYRef.current;
    dragStartYRef.current = null;
    const offset = dragOffset;
    setDragOffset(0);
    if (start != null && offset > 80) collapseDrawer();
  }

  return (
    <>
      {/* Expanded overlay — clips below the sticky HeaderBar (h-14) so the
          header remains visible and tappable. */}
      <div
        className={`fixed top-14 inset-x-0 bottom-0 z-[55] bg-white transition-transform duration-300 ease-out flex flex-col ${
          isDrawerExpanded ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        style={{
          transform: isDrawerExpanded
            ? `translateY(${dragOffset}px)`
            : undefined,
          transition: dragOffset > 0 ? "none" : undefined,
        }}
        aria-hidden={!isDrawerExpanded}
      >
        {/* Drag handle / collapse bar — grab bar centered, explicit X on
            the right because the bar alone wasn't obvious enough as a
            close affordance. */}
        <div
          className="shrink-0 relative pt-3 pb-2 flex justify-center items-center bg-white"
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <button
            type="button"
            onClick={collapseDrawer}
            aria-label="Collapse music"
            className="w-12 h-1.5 rounded-full bg-gray-300 active:bg-gray-400"
          />
          <button
            type="button"
            onClick={collapseDrawer}
            aria-label="Close music"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Music page content — only render when expanded so its useEffects
            don't run while the drawer is closed. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isDrawerExpanded && <MusicPage initialSongs={songs} />}
        </div>
      </div>

      {/* Collapsed mini-player — hidden while expanded so we don't double up */}
      <div
        className={`fixed bottom-16 left-0 right-0 z-35 bg-white border-t border-gray-200 shadow-lg transition-opacity duration-200 ${
          isDrawerExpanded ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        aria-hidden={isDrawerExpanded}
      >
        {/* Progress bar */}
        <div className="h-0.5 bg-gray-100">
          <div
            className="h-full bg-green-600 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center h-14 px-3 gap-3">
          {/* Art + Song info — tappable to expand */}
          <button
            type="button"
            onClick={expandDrawer}
            className="flex items-center gap-3 flex-1 min-w-0 text-left"
            aria-label="Open music player"
          >
            {(currentSong.art_thumb_url || currentSong.art_url) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={currentSong.id}
                src={currentSong.art_thumb_url || currentSong.art_url!}
                alt=""
                className="w-8 h-8 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {currentSong.title}
              </div>
              {currentSong.tagged_user && (
                <div className="text-xs text-gray-500 truncate">
                  {currentSong.tagged_user.display_name}
                </div>
              )}
            </div>
          </button>

          {/* Transport controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={previous}
              className="flex items-center justify-center w-9 h-9"
              aria-label="Previous"
            >
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={togglePlayPause}
              className="flex items-center justify-center w-10 h-10"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <svg className="w-7 h-7 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-gray-900" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={next}
              className="flex items-center justify-center w-9 h-9"
              aria-label="Next"
            >
              <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
