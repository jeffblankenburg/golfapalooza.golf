"use client";

import { useState, useRef } from "react";
import { useV2Music } from "./MusicProvider";
import ReactMarkdown from "react-markdown";
import { AndroidBackgroundAudioHint } from "./AndroidBackgroundAudioHint";
/* eslint-disable @next/next/no-img-element */

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** The full-screen jukebox UI (now-playing + transport + searchable playlist).
 *  Renders inside the expanded MusicDrawer overlay. Audio lives in MusicProvider,
 *  so this can mount/unmount freely without affecting playback. */
export default function MusicPage() {
  const {
    songs,
    currentIndex,
    isPlaying,
    currentTime,
    duration,
    isShuffled,
    favoritesOnly,
    play,
    togglePlayPause,
    next,
    previous,
    seek,
    toggleShuffle,
    toggleFavoritesOnly,
    toggleFavorite,
  } = useV2Music();

  const [search, setSearch] = useState("");
  const [showLyrics, setShowLyrics] = useState(false);
  const seekBarRef = useRef<HTMLDivElement>(null);

  const currentSong = songs[currentIndex] || null;

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const bar = seekBarRef.current;
    if (!bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seek(pct * duration);
  };

  const filteredSongs = songs.filter((s) => {
    if (favoritesOnly && !s.is_favorite) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.title.toLowerCase().includes(q) || (s.tagged_user?.display_name || "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="px-4 pt-4 pb-8">
      <AndroidBackgroundAudioHint />

      {currentSong && (
        <div className="mb-6">
          <div className="flex justify-center mb-4">
            {currentSong.art_url ? (
              <img
                key={currentSong.id}
                src={currentSong.art_url}
                alt={currentSong.title}
                className="w-52 h-52 rounded-2xl object-cover shadow-lg"
              />
            ) : (
              <div className="w-52 h-52 rounded-2xl bg-green-50 flex items-center justify-center shadow-lg">
                <svg className="w-20 h-20 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            )}
          </div>

          <div className="text-center mb-4">
            <h1 className="text-lg font-bold text-gray-900">{currentSong.title}</h1>
            {currentSong.tagged_user && <p className="text-sm text-gray-500">{currentSong.tagged_user.display_name}</p>}
          </div>

          <div className="mb-2">
            <div ref={seekBarRef} className="h-2 bg-gray-200 rounded-full cursor-pointer" onClick={handleSeek} onTouchMove={handleSeek}>
              <div className="h-full bg-green-600 rounded-full relative" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-green-600 rounded-full shadow" />
              </div>
            </div>
            <div className="flex justify-between mt-1 text-xs text-gray-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <button onClick={toggleShuffle} className={`flex items-center justify-center w-10 h-10 ${isShuffled ? "text-green-600" : "text-gray-400"}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4l3 8-3 8H4m16-16h-4l-3 8 3 8h4M4 12h16" />
              </svg>
            </button>
            <button onClick={previous} className="flex items-center justify-center w-12 h-12">
              <svg className="w-8 h-8 text-gray-900" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button onClick={togglePlayPause} className="flex items-center justify-center w-16 h-16 bg-green-600 rounded-full shadow-lg active:scale-95 transition-transform">
              {isPlaying ? (
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
              ) : (
                <svg className="w-8 h-8 text-white translate-x-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button onClick={next} className="flex items-center justify-center w-12 h-12">
              <svg className="w-8 h-8 text-gray-900" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            <button onClick={toggleFavoritesOnly} className={`flex items-center justify-center w-10 h-10 ${favoritesOnly ? "text-red-500" : "text-gray-400"}`}>
              <svg className="w-5 h-5" fill={favoritesOnly ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>

          {currentSong.lyrics && (
            <div className="mt-4">
              <button onClick={() => setShowLyrics(!showLyrics)} className="text-sm font-medium text-green-700 flex items-center gap-1">
                <svg className={`w-4 h-4 transition-transform ${showLyrics ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Lyrics
              </button>
              {showLyrics && (
                <div className="mt-3 p-4 bg-gray-50 rounded-xl prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown>{currentSong.lyrics}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search songs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2 text-base"
          />
        </div>

        <div className="space-y-0.5">
          {filteredSongs.map((song) => {
            const originalIndex = songs.findIndex((s) => s.id === song.id);
            const isActive = originalIndex === currentIndex;
            return (
              <div
                key={song.id}
                onClick={() => play(originalIndex)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${isActive ? "bg-green-50" : "active:bg-gray-50"}`}
              >
                {song.art_thumb_url || song.art_url ? (
                  <img src={song.art_thumb_url || song.art_url!} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isActive ? "text-green-700" : "text-gray-900"}`}>{song.title}</div>
                  {song.tagged_user && <div className="text-xs text-gray-500 truncate">{song.tagged_user.display_name}</div>}
                </div>

                {song.duration_seconds && <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(song.duration_seconds)}</span>}

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(song.id);
                  }}
                  className="flex-shrink-0 p-1"
                  aria-label={song.is_favorite ? "Unfavorite" : "Favorite"}
                >
                  <svg className={`w-5 h-5 ${song.is_favorite ? "text-red-500" : "text-gray-300"}`} fill={song.is_favorite ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              </div>
            );
          })}

          {filteredSongs.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">
              {search ? "No songs match your search" : favoritesOnly ? "No favorite songs yet" : "No songs available"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
