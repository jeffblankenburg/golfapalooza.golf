"use client";

import Link from "next/link";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

export function MiniPlayer() {
  const {
    songs,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    isVisible,
    togglePlayPause,
    next,
    previous,
  } = useMusicPlayer();

  if (!isVisible || songs.length === 0) return null;

  const currentSong = songs[currentIndex];
  if (!currentSong) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-35 bg-white border-t border-gray-200 shadow-lg">
      {/* Progress bar */}
      <div className="h-0.5 bg-gray-100">
        <div
          className="h-full bg-green-600 transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center h-14 px-3 gap-3">
        {/* Art + Song info (tappable to go to /music) */}
        <Link href="/music" className="flex items-center gap-3 flex-1 min-w-0">
          {(currentSong.art_thumb_url || currentSong.art_url) ? (
            <img
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
        </Link>

        {/* Transport controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={previous}
            className="flex items-center justify-center w-9 h-9"
          >
            <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          <button
            onClick={togglePlayPause}
            className="flex items-center justify-center w-10 h-10"
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
            onClick={next}
            className="flex items-center justify-center w-9 h-9"
          >
            <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
