"use client";

import { useEffect } from "react";
import { useV2Music } from "./MusicProvider";
import MusicPage from "./MusicPage";
import { useNameMode } from "./NameMode";
import { pickName } from "@/lib/v2/profile";
import styles from "./event-shell.module.css";
/* eslint-disable @next/next/no-img-element */

/**
 * Universal music surface, rendered by MusicProvider (so it survives the shell's
 * shared-drawer open/close and page navigation). Three states:
 *   - Hidden: nothing has played and the drawer hasn't been opened.
 *   - Collapsed: a thin mini-player strip above the bottom nav.
 *   - Expanded: full overlay (between the fixed bars) holding MusicPage.
 * Audio lives in the provider's <audio>; this is pure UI.
 *
 * Offsets match the event shell (top bar 56px, bottom nav 60px, bars z-60):
 * overlay z-55 / backdrop z-50 / mini-player z-40 — always below the bars.
 */
export default function MusicDrawer() {
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
    dismiss,
  } = useV2Music();
  const mode = useNameMode();

  useEffect(() => {
    if (!isDrawerExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isDrawerExpanded]);

  if (!isVisible || songs.length === 0) return null;
  const currentSong = songs[currentIndex];
  if (!currentSong) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Backdrop between the fixed bars while expanded. */}
      <div
        onClick={collapseDrawer}
        aria-hidden="true"
        style={{ bottom: "var(--nav-h, 0px)" }}
        className={`fixed left-0 right-0 top-[56px] z-[50] bg-[#17211d]/20 backdrop-blur-[6px] transition-opacity duration-200 ${
          isDrawerExpanded ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Expanded overlay — clips below the top bar (56px + 50px gap) and above
          the bottom nav, mirroring the shell's shared drawer. */}
      <div
        style={{ bottom: "var(--nav-h, 0px)" }}
        className={`fixed left-0 right-0 top-[106px] z-[55] bg-[var(--paper)] rounded-t-2xl shadow-[0_-12px_30px_-18px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out flex flex-col ${
          isDrawerExpanded ? "translate-y-0" : "translate-y-full pointer-events-none"
        }`}
        aria-hidden={!isDrawerExpanded}
      >
        {/* Standard shared-drawer header (matches Chat/Photos/Rounds/etc.). */}
        <div className={styles.drawerHead}>
          <span className={styles.drawerTitle}>Music</span>
          <button type="button" className={styles.drawerClose} onClick={collapseDrawer} aria-label="Close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{isDrawerExpanded && <MusicPage />}</div>
      </div>

      {/* Collapsed mini-player — part of the bottom chrome: sits directly above
          the bottom nav (--nav-h) and above the function drawers (z-58 > 55), so
          it's present + on top on every page. Absorbs the safe-area itself when
          there's no nav below it (e.g. the full-screen scorer). */}
      <div
        style={{
          bottom: "var(--nav-h, 0px)",
          paddingBottom: "max(0px, calc(env(safe-area-inset-bottom, 0px) - var(--nav-h, 0px)))",
        }}
        className={`fixed left-0 right-0 z-[58] bg-[var(--card)] border-t border-[var(--line)] shadow-lg transition-opacity duration-200 ${
          isDrawerExpanded ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        aria-hidden={isDrawerExpanded}
      >
        <div className="h-0.5 bg-[var(--line)]">
          <div className="h-full bg-[var(--brand)] transition-[width] duration-200" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex items-center h-14 px-2 gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="flex items-center justify-center w-9 h-9 flex-shrink-0 text-[var(--ink-soft)]"
            aria-label="Close music player"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <button type="button" onClick={expandDrawer} className="flex items-center gap-3 flex-1 min-w-0 text-left" aria-label="Open music player">
            {currentSong.art_thumb_url || currentSong.art_url ? (
              <img key={currentSong.id} src={currentSong.art_thumb_url || currentSong.art_url!} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded bg-[var(--brand)]/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-[var(--brand)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--ink)] truncate">{currentSong.title}</div>
              {currentSong.tagged_user && <div className="text-xs text-[var(--ink-soft)] truncate">{pickName(currentSong.tagged_user, mode)}</div>}
            </div>
          </button>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button type="button" onClick={previous} className="flex items-center justify-center w-9 h-9" aria-label="Previous">
              <svg className="w-5 h-5 text-[var(--ink-soft)]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
            </button>
            <button type="button" onClick={togglePlayPause} className="flex items-center justify-center w-10 h-10" aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? (
                <svg className="w-7 h-7 text-[var(--ink)]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>
              ) : (
                <svg className="w-7 h-7 text-[var(--ink)]" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
              )}
            </button>
            <button type="button" onClick={next} className="flex items-center justify-center w-9 h-9" aria-label="Next">
              <svg className="w-5 h-5 text-[var(--ink-soft)]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
