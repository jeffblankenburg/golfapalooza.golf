"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

export interface Song {
  id: string;
  title: string;
  mp3_url: string;
  art_url: string | null;
  art_thumb_url: string | null;
  lyrics: string | null;
  duration_seconds: number | null;
  sort_order: number;
  tagged_user: { id: string; display_name: string; avatar_url?: string | null } | null;
  is_favorite: boolean;
}

interface MusicPlayerState {
  songs: Song[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffled: boolean;
  favoritesOnly: boolean;
  // `isVisible` = the music drawer is mounted on screen in any form
  // (collapsed mini-player or expanded full-screen). Flipped true the
  // first time a song plays OR when the user opens the drawer manually.
  isVisible: boolean;
  // Drawer expanded full-screen (true) vs. collapsed as the mini-player
  // strip above the bottom nav (false).
  isDrawerExpanded: boolean;
}

interface MusicPlayerActions {
  loadSongs: (songs: Song[]) => void;
  play: (index?: number) => void;
  pause: () => void;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleShuffle: () => void;
  toggleFavoritesOnly: () => void;
  toggleFavorite: (songId: string) => void;
  dismiss: () => void;
  expandDrawer: () => void;
  collapseDrawer: () => void;
  toggleDrawer: () => void;
}

type MusicPlayerContextType = MusicPlayerState & MusicPlayerActions;

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null);

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return ctx;
}

/** Safe variant that returns null outside MusicPlayerProvider (e.g., spectator pages) */
export function useMusicPlayerOptional() {
  return useContext(MusicPlayerContext);
}

// localStorage helpers for persisting player state
const STORAGE_KEY_INDEX = "golfapalooza_player_index";
const STORAGE_KEY_SHUFFLE = "golfapalooza_player_shuffle";
const STORAGE_KEY_PLAYING = "golfapalooza_player_playing";
const STORAGE_KEY_TIME = "golfapalooza_player_time";

function loadStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function loadStoredBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "true";
}

export function MusicPlayerContextProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [songs, setSongs] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(() => loadStoredNumber(STORAGE_KEY_INDEX, 0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isShuffled, setIsShuffled] = useState(() => loadStoredBool(STORAGE_KEY_SHUFFLE, false));
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

  // Whether we should auto-resume after songs load
  const shouldAutoResumeRef = useRef(loadStoredBool(STORAGE_KEY_PLAYING, false));
  const storedTimeRef = useRef(loadStoredNumber(STORAGE_KEY_TIME, 0));

  // Tracks whether the user WANTS audio playing, independent of the element's
  // actual state. iOS involuntarily pauses the <audio> element when a
  // standalone PWA is backgrounded; that fires the audio "pause" event and
  // flips `isPlaying` false, but it does NOT mean the user paused. We keep this
  // intent flag (and the persisted STORAGE_KEY_PLAYING) true through such
  // interruptions so we can auto-resume on return to the foreground. Only an
  // explicit `pause()`/`dismiss()` clears it.
  const intendPlayingRef = useRef(loadStoredBool(STORAGE_KEY_PLAYING, false));
  const setIntendPlaying = useCallback((want: boolean) => {
    intendPlayingRef.current = want;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_PLAYING, String(want));
    }
  }, []);

  // Refs for stable access inside callbacks (avoids stale closures)
  const songsRef = useRef(songs);
  songsRef.current = songs;
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const isShuffledRef = useRef(isShuffled);
  isShuffledRef.current = isShuffled;
  const shuffleOrderRef = useRef(shuffleOrder);
  shuffleOrderRef.current = shuffleOrder;
  const favoritesOnlyRef = useRef(favoritesOnly);
  favoritesOnlyRef.current = favoritesOnly;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // ── Playlist navigation ────────────────────────────────────────────────

  const computeNextIndex = useCallback((fromIndex: number, direction: 1 | -1): number => {
    const s = songsRef.current;
    const shuffled = isShuffledRef.current;
    const order = shuffleOrderRef.current;
    const favOnly = favoritesOnlyRef.current;

    const playlist = favOnly
      ? s.map((song, i) => ({ song, idx: i })).filter((item) => item.song.is_favorite)
      : s.map((song, i) => ({ song, idx: i }));

    if (playlist.length === 0) return fromIndex;

    if (shuffled && order.length > 0) {
      const pos = order.indexOf(fromIndex);
      const nextPos = (pos + direction + order.length) % order.length;
      return order[nextPos];
    }

    const currentPos = playlist.findIndex((p) => p.idx === fromIndex);
    if (currentPos === -1) return playlist[0]?.idx ?? 0;
    const nextPos = (currentPos + direction + playlist.length) % playlist.length;
    return playlist[nextPos].idx;
  }, []);

  // ── Record play after 10s of playback (fire and forget) ─────────────

  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecordedRef = useRef<string | null>(null);

  const cancelPlayTimer = useCallback(() => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);

  const startPlayTimer = useCallback((songId: string) => {
    cancelPlayTimer();
    if (lastRecordedRef.current === songId) return;
    playTimerRef.current = setTimeout(() => {
      lastRecordedRef.current = songId;
      fetch("/api/songs/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_id: songId }),
      }).catch(() => {});
      playTimerRef.current = null;
    }, 10_000);
  }, [cancelPlayTimer]);

  // ── Core playback actions ──────────────────────────────────────────────

  const playIndex = useCallback(
    (targetIndex: number) => {
      const s = songsRef.current;
      const targetSong = s[targetIndex];
      if (!targetSong) return;

      const audio = audioRef.current;
      if (!audio) return;

      setIsVisible(true);
      setIntendPlaying(true);
      startPlayTimer(targetSong.id);

      // Only reload if the src actually changed
      if (!audio.src || !audio.src.endsWith(new URL(targetSong.mp3_url).pathname)) {
        audio.src = targetSong.mp3_url;
        audio.load();
      }

      setCurrentIndex(targetIndex);
      currentIndexRef.current = targetIndex;
      audio.play().catch(() => {});
      setIsPlaying(true);
    },
    [startPlayTimer, setIntendPlaying]
  );

  const loadSongs = useCallback(
    (newSongs: Song[]) => {
      setSongs(newSongs);
      songsRef.current = newSongs;

      if (newSongs.length === 0) return;

      // Clamp stored index to valid range
      const storedIdx = currentIndexRef.current;
      const idx = storedIdx >= 0 && storedIdx < newSongs.length ? storedIdx : 0;
      if (idx !== storedIdx) {
        setCurrentIndex(idx);
        currentIndexRef.current = idx;
      }

      // If shuffle was persisted, regenerate shuffle order
      if (isShuffledRef.current && shuffleOrderRef.current.length === 0) {
        const playlist = newSongs.map((_, i) => i);
        for (let i = playlist.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
        }
        setShuffleOrder(playlist);
        shuffleOrderRef.current = playlist;
      }

      const audio = audioRef.current;
      if (!audio) return;

      // Auto-resume if we were playing before refresh
      if (shouldAutoResumeRef.current) {
        shouldAutoResumeRef.current = false;
        const song = newSongs[idx];
        if (song) {
          audio.src = song.mp3_url;
          audio.volume = volumeRef.current;
          audio.load();
          const resumeTime = storedTimeRef.current;
          const onCanPlay = () => {
            if (resumeTime > 0) audio.currentTime = resumeTime;
            audio.play().catch(() => {});
            setIsPlaying(true);
            setIsVisible(true);
            startPlayTimer(song.id);
            audio.removeEventListener("canplay", onCanPlay);
          };
          audio.addEventListener("canplay", onCanPlay);
          setIsVisible(true);
          return;
        }
      }

      // Otherwise just preload the current song
      if (!audio.currentTime) {
        audio.src = newSongs[idx].mp3_url;
        audio.volume = volumeRef.current;
        audio.load();
      }
    },
    [startPlayTimer]
  );

  // Resume: force-reinitialize audio pipeline for iOS lock screen compatibility
  const resume = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    const savedTime = audio.currentTime;
    audio.pause();
    audio.currentTime = savedTime;
    // Nudge volume to force iOS audio pipeline reattachment
    audio.volume = 0.999;
    try {
      await audio.play();
    } catch {
      // silent
    }
    audio.volume = volumeRef.current;
    setIsPlaying(true);
    setIntendPlaying(true);
    const song = songsRef.current[currentIndexRef.current];
    if (song) startPlayTimer(song.id);
  }, [startPlayTimer, setIntendPlaying]);

  const play = useCallback(
    (index?: number) => {
      if (songsRef.current.length === 0) return;
      const targetIdx = index ?? currentIndexRef.current;
      // If resuming the same song that's already loaded, just unpause
      if (targetIdx === currentIndexRef.current && audioRef.current?.src) {
        resume();
        return;
      }
      playIndex(targetIdx);
    },
    [playIndex, resume]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
    setIntendPlaying(false);
    cancelPlayTimer();
  }, [cancelPlayTimer, setIntendPlaying]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) pause();
    else play();
  }, [isPlaying, pause, play]);

  const advanceToNext = useCallback(() => {
    if (songsRef.current.length === 0) return;
    const nextIdx = computeNextIndex(currentIndexRef.current, 1);
    playIndex(nextIdx);
  }, [computeNextIndex, playIndex]);

  const next = useCallback(() => advanceToNext(), [advanceToNext]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (songsRef.current.length === 0) return;
    const prevIdx = computeNextIndex(currentIndexRef.current, -1);
    playIndex(prevIdx);
  }, [computeNextIndex, playIndex]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = time;
        setCurrentTime(time);
      }
    },
    []
  );

  const setVolume = useCallback(
    (vol: number) => {
      setVolumeState(vol);
      volumeRef.current = vol;
      if (audioRef.current) audioRef.current.volume = vol;
    },
    []
  );

  const toggleShuffle = useCallback(() => {
    setIsShuffled((prev) => {
      if (!prev) {
        const s = songsRef.current;
        const favOnly = favoritesOnlyRef.current;
        const playlist = favOnly
          ? s.map((_, i) => i).filter((i) => s[i].is_favorite)
          : s.map((_, i) => i);
        // Fisher-Yates
        for (let i = playlist.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
        }
        setShuffleOrder(playlist);
        shuffleOrderRef.current = playlist;
      }
      isShuffledRef.current = !prev;
      return !prev;
    });
  }, []);

  const toggleFavoritesOnly = useCallback(() => {
    setFavoritesOnly((prev) => {
      favoritesOnlyRef.current = !prev;
      return !prev;
    });
  }, []);

  const toggleFavorite = useCallback((songId: string) => {
    setSongs((prev) => {
      const updated = prev.map((s) =>
        s.id === songId ? { ...s, is_favorite: !s.is_favorite } : s
      );
      songsRef.current = updated;
      return updated;
    });

    const song = songsRef.current.find((s) => s.id === songId);
    if (song) {
      const method = song.is_favorite ? "DELETE" : "POST";
      fetch("/api/songs/favorites", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ song_id: songId }),
      }).catch(() => {
        setSongs((prev) => {
          const reverted = prev.map((s) =>
            s.id === songId ? { ...s, is_favorite: !s.is_favorite } : s
          );
          songsRef.current = reverted;
          return reverted;
        });
      });
    }
  }, []);

  const dismiss = useCallback(() => {
    pause();
    cancelPlayTimer();
    setIsVisible(false);
    setIsDrawerExpanded(false);
    localStorage.setItem(STORAGE_KEY_PLAYING, "false");
  }, [pause, cancelPlayTimer]);

  // Drawer controls. `expandDrawer` flips `isVisible` true so the music UI
  // becomes available from anywhere (e.g., the user taps the music icon
  // before any song has been queued). Each open broadcasts to other
  // universal drawers (e.g., chat) so only one full-screen surface is
  // active at a time — same z-layer otherwise stacks them invisibly.
  function broadcastOpen() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: "music" } }));
    }
  }
  const expandDrawer = useCallback(() => {
    setIsVisible(true);
    setIsDrawerExpanded(true);
    broadcastOpen();
  }, []);
  const collapseDrawer = useCallback(() => {
    setIsDrawerExpanded(false);
  }, []);
  // Mirror expanded state in a ref so toggleDrawer can branch without
  // putting side effects inside a setState updater (updaters must be pure).
  const isDrawerExpandedRef = useRef(isDrawerExpanded);
  useEffect(() => { isDrawerExpandedRef.current = isDrawerExpanded; }, [isDrawerExpanded]);
  const toggleDrawer = useCallback(() => {
    const willOpen = !isDrawerExpandedRef.current;
    setIsDrawerExpanded(willOpen);
    if (willOpen) {
      setIsVisible(true);
      broadcastOpen();
    }
  }, []);

  // Collapse when another universal drawer (chat, etc.) takes the screen.
  // Music keeps playing; we just step out of the way visually.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name && detail.name !== "music") setIsDrawerExpanded(false);
    };
    window.addEventListener("ui:drawer-open", handler);
    return () => window.removeEventListener("ui:drawer-open", handler);
  }, []);

  // Auto-load the song catalog once on mount so the universal drawer works
  // from any page — no need to visit /music first to hydrate the context.
  // /music's server fetch still wins (passes initialSongs into loadSongs)
  // because that runs after mount and overwrites with fresher data.
  useEffect(() => {
    if (songsRef.current.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/songs");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = (data.songs || []) as Song[];
        if (list.length > 0 && songsRef.current.length === 0) loadSongs(list);
      } catch { /* offline / spectator — fine */ }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Event listeners on audio element ───────────────────────────────────

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => advanceToNext();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [advanceToNext]);

  // ── Persist player state to localStorage ────────────────────────────────

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INDEX, String(currentIndex));
  }, [currentIndex]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHUFFLE, String(isShuffled));
  }, [isShuffled]);

  // NOTE: STORAGE_KEY_PLAYING is intentionally NOT driven off `isPlaying`.
  // It tracks user INTENT and is written by setIntendPlaying() from the
  // play/resume/pause actions. Persisting raw `isPlaying` here would let an
  // involuntary background pause (iOS suspending the PWA) clobber the intent
  // and break cold-start auto-resume.

  // Persist current time periodically (every 5 seconds to avoid thrashing)
  const lastSavedTimeRef = useRef(0);
  useEffect(() => {
    if (Math.abs(currentTime - lastSavedTimeRef.current) >= 5) {
      lastSavedTimeRef.current = currentTime;
      localStorage.setItem(STORAGE_KEY_TIME, String(currentTime));
    }
  }, [currentTime]);

  // ── Resume playback when returning to the foreground ───────────────────
  // iOS suspends a standalone PWA when backgrounded, involuntarily pausing the
  // <audio> element. When the user comes back, re-arm playback from the saved
  // position if they still intend to be playing. Best-effort: if iOS rejects
  // the programmatic play() (no user gesture), it no-ops and the user can tap
  // play — but in practice resuming interrupted media is usually allowed.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const audio = audioRef.current;
      if (intendPlayingRef.current && audio && audio.paused) {
        resume();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [resume]);

  // ── Media Session API (lock screen / CarPlay controls) ─────────────────

  useEffect(() => {
    if (!("mediaSession" in navigator) || songs.length === 0) return;

    const currentSong = songs[currentIndex];
    if (!currentSong) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.tagged_user?.display_name || "Golfapalooza",
      album: "Golfapalooza",
      artwork: currentSong.art_url
        ? [{ src: currentSong.art_url, sizes: "512x512", type: "image/jpeg" }]
        : [],
    });

    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    navigator.mediaSession.setActionHandler("play", async () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
  }, [songs, currentIndex, isPlaying, play, pause, resume, previous, next, seek]);

  return (
    <MusicPlayerContext.Provider
      value={{
        songs,
        currentIndex,
        isPlaying,
        currentTime,
        duration,
        volume,
        isShuffled,
        favoritesOnly,
        isVisible,
        isDrawerExpanded,
        loadSongs,
        play,
        pause,
        togglePlayPause,
        next,
        previous,
        seek,
        setVolume,
        toggleShuffle,
        toggleFavoritesOnly,
        toggleFavorite,
        dismiss,
        expandDrawer,
        collapseDrawer,
        toggleDrawer,
      }}
    >
      <audio ref={audioRef} preload="auto" />
      {children}
    </MusicPlayerContext.Provider>
  );
}
