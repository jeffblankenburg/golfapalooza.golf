"use client";

import { useState, useRef } from "react";
import { useV2Music } from "./MusicProvider";
import ReactMarkdown from "react-markdown";
import { AndroidBackgroundAudioHint } from "./AndroidBackgroundAudioHint";
import { useNameMode } from "./NameMode";
import { pickName } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

const NoteIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="100%" height="100%" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);
const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg width="20" height="20" fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
  </svg>
);

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
  const mode = useNameMode();

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
      return s.title.toLowerCase().includes(q) || (s.tagged_user ? pickName(s.tagged_user, mode) : "").toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className={styles.musicPage}>
      <AndroidBackgroundAudioHint />

      {currentSong && (
        <div className={styles.musicNow}>
          <div className={styles.musicArtWrap}>
            {currentSong.art_url ? (
              <img key={currentSong.id} src={currentSong.art_url} alt={currentSong.title} className={styles.musicArt} />
            ) : (
              <div className={styles.musicArtFallback}>
                <NoteIcon className={styles.musicArtNote} />
              </div>
            )}
          </div>

          <div className={styles.musicNowTitle}>{currentSong.title}</div>
          {currentSong.tagged_user && <div className={styles.musicNowArtist}>{pickName(currentSong.tagged_user, mode)}</div>}

          <div className={styles.musicSeek}>
            <div ref={seekBarRef} className={styles.musicSeekTrack} onClick={handleSeek} onTouchMove={handleSeek}>
              <div className={styles.musicSeekFill} style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}>
                <div className={styles.musicSeekThumb} />
              </div>
            </div>
            <div className={styles.musicTimes}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className={styles.musicTransport}>
            <button className={styles.musicSecondary} data-on={isShuffled} onClick={toggleShuffle} aria-label="Shuffle" aria-pressed={isShuffled}>
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h4l3 8-3 8H4m16-16h-4l-3 8 3 8h4M4 12h16" />
              </svg>
            </button>
            <button className={styles.musicSkip} onClick={previous} aria-label="Previous">
              <svg width="30" height="30" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button className={styles.musicPlay} onClick={togglePlayPause} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? (
                <svg width="30" height="30" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
              ) : (
                <svg width="30" height="30" fill="currentColor" viewBox="0 0 24 24" style={{ transform: "translateX(1px)" }}><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button className={styles.musicSkip} onClick={next} aria-label="Next">
              <svg width="30" height="30" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
            <button className={styles.musicSecondary} data-fav={favoritesOnly} onClick={toggleFavoritesOnly} aria-label="Favorites only" aria-pressed={favoritesOnly}>
              <HeartIcon filled={favoritesOnly} />
            </button>
          </div>

          {currentSong.lyrics && (
            <div>
              <button className={styles.musicLyricsToggle} onClick={() => setShowLyrics(!showLyrics)}>
                <svg className={styles.musicLyricsChevron} data-open={showLyrics} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Lyrics
              </button>
              {showLyrics && (
                <div className={styles.musicLyrics}>
                  <ReactMarkdown>{currentSong.lyrics}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={styles.musicSearch}>
        <input
          type="text"
          placeholder="Search songs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.input}
        />
      </div>

      <div className={styles.musicList}>
        {filteredSongs.map((song) => {
          const originalIndex = songs.findIndex((s) => s.id === song.id);
          const isActive = originalIndex === currentIndex;
          return (
            <div key={song.id} className={styles.musicRow} data-active={isActive} onClick={() => play(originalIndex)}>
              {song.art_thumb_url || song.art_url ? (
                <img src={song.art_thumb_url || song.art_url!} alt="" className={styles.musicThumb} />
              ) : (
                <div className={styles.musicThumbFallback}>
                  <NoteIcon className={styles.musicThumbNote} />
                </div>
              )}

              <div className={styles.musicRowText}>
                <div className={styles.musicRowTitle}>{song.title}</div>
                {song.tagged_user && <div className={styles.musicRowArtist}>{pickName(song.tagged_user, mode)}</div>}
              </div>

              {song.duration_seconds && <span className={styles.musicRowTime}>{formatTime(song.duration_seconds)}</span>}

              <button
                className={styles.musicFav}
                data-on={song.is_favorite}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(song.id);
                }}
                aria-label={song.is_favorite ? "Unfavorite" : "Favorite"}
              >
                <HeartIcon filled={!!song.is_favorite} />
              </button>
            </div>
          );
        })}

        {filteredSongs.length === 0 && (
          <div className={styles.musicEmpty}>
            {search ? "No songs match your search" : favoritesOnly ? "No favorite songs yet" : "No songs available"}
          </div>
        )}
      </div>
    </div>
  );
}
