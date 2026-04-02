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
  isVisible: boolean;
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
}

type MusicPlayerContextType = MusicPlayerState & MusicPlayerActions;

const MusicPlayerContext = createContext<MusicPlayerContextType | null>(null);

export function useMusicPlayer() {
  const ctx = useContext(MusicPlayerContext);
  if (!ctx) throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  return ctx;
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
  // Dual audio elements for gapless playback
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  // Which slot is active: 0 = A, 1 = B
  const activeSlotRef = useRef<0 | 1>(0);
  // What song index the buffer has preloaded (-1 = nothing)
  const preloadedIndexRef = useRef(-1);

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

  // Whether we should auto-resume after songs load
  const shouldAutoResumeRef = useRef(loadStoredBool(STORAGE_KEY_PLAYING, false));
  const storedTimeRef = useRef(loadStoredNumber(STORAGE_KEY_TIME, 0));

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

  // ── Audio element helpers ──────────────────────────────────────────────

  const getActive = useCallback((): HTMLAudioElement | null => {
    return activeSlotRef.current === 0 ? audioARef.current : audioBRef.current;
  }, []);

  const getBuffer = useCallback((): HTMLAudioElement | null => {
    return activeSlotRef.current === 0 ? audioBRef.current : audioARef.current;
  }, []);

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

  // ── Preload next song into buffer ──────────────────────────────────────

  const preloadNext = useCallback(() => {
    const buffer = getBuffer();
    const s = songsRef.current;
    const idx = currentIndexRef.current;
    if (!buffer || s.length < 2) return;

    const nextIdx = computeNextIndex(idx, 1);
    if (nextIdx === idx) return; // single-song playlist

    const nextSong = s[nextIdx];
    if (!nextSong) return;

    buffer.src = nextSong.mp3_url;
    buffer.volume = volumeRef.current;
    buffer.load();
    preloadedIndexRef.current = nextIdx;
  }, [getBuffer, computeNextIndex]);

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

      setIsVisible(true);
      startPlayTimer(targetSong.id);

      // If the buffer already has this song preloaded → swap for instant start
      if (preloadedIndexRef.current === targetIndex) {
        const buffer = getBuffer();
        if (buffer) {
          // Grab ref to old element before swapping
          const old = activeSlotRef.current === 0 ? audioARef.current : audioBRef.current;

          // Swap slot FIRST so onPause from old element won't affect state
          activeSlotRef.current = activeSlotRef.current === 0 ? 1 : 0;
          setCurrentIndex(targetIndex);
          currentIndexRef.current = targetIndex;

          if (old) old.pause();
          buffer.play().catch(() => {});
          setIsPlaying(true);
          preloadedIndexRef.current = -1;
          setTimeout(preloadNext, 0);
          return;
        }
      }

      // Otherwise load into active element and play
      const active = getActive();
      if (!active) return;

      // Only reload if the src actually changed
      if (!active.src || !active.src.endsWith(new URL(targetSong.mp3_url).pathname)) {
        active.src = targetSong.mp3_url;
        active.load();
      }

      setCurrentIndex(targetIndex);
      currentIndexRef.current = targetIndex;
      active.play().catch(() => {});
      setIsPlaying(true);
      preloadedIndexRef.current = -1;
      setTimeout(preloadNext, 100);
    },
    [getActive, getBuffer, preloadNext]
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

      const active = getActive();
      if (!active) return;

      // Auto-resume if we were playing before refresh
      if (shouldAutoResumeRef.current) {
        shouldAutoResumeRef.current = false;
        const song = newSongs[idx];
        if (song) {
          active.src = song.mp3_url;
          active.volume = volumeRef.current;
          active.load();
          const resumeTime = storedTimeRef.current;
          const onCanPlay = () => {
            if (resumeTime > 0) active.currentTime = resumeTime;
            active.play().catch(() => {});
            setIsPlaying(true);
            setIsVisible(true);
            startPlayTimer(song.id);
            active.removeEventListener("canplay", onCanPlay);
            setTimeout(preloadNext, 100);
          };
          active.addEventListener("canplay", onCanPlay);
          setIsVisible(true);
          return;
        }
      }

      // Otherwise just preload the current song
      if (!active.currentTime) {
        active.src = newSongs[idx].mp3_url;
        active.volume = volumeRef.current;
        active.load();
      }
    },
    [getActive, preloadNext, startPlayTimer]
  );

  const play = useCallback(
    (index?: number) => {
      if (songsRef.current.length === 0) return;
      playIndex(index ?? currentIndexRef.current);
    },
    [playIndex]
  );

  const pause = useCallback(() => {
    getActive()?.pause();
    setIsPlaying(false);
    cancelPlayTimer();
  }, [getActive, cancelPlayTimer]);

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
    const active = getActive();
    if (active && active.currentTime > 3) {
      active.currentTime = 0;
      return;
    }
    if (songsRef.current.length === 0) return;
    const prevIdx = computeNextIndex(currentIndexRef.current, -1);
    playIndex(prevIdx);
  }, [getActive, computeNextIndex, playIndex]);

  const seek = useCallback(
    (time: number) => {
      const active = getActive();
      if (active) {
        active.currentTime = time;
        setCurrentTime(time);
      }
    },
    [getActive]
  );

  const setVolume = useCallback(
    (vol: number) => {
      setVolumeState(vol);
      volumeRef.current = vol;
      const a = getActive();
      const b = getBuffer();
      if (a) a.volume = vol;
      if (b) b.volume = vol;
    },
    [getActive, getBuffer]
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
    // Re-preload since next song may have changed
    setTimeout(preloadNext, 0);
  }, [preloadNext]);

  const toggleFavoritesOnly = useCallback(() => {
    setFavoritesOnly((prev) => {
      favoritesOnlyRef.current = !prev;
      return !prev;
    });
    setTimeout(preloadNext, 0);
  }, [preloadNext]);

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
    localStorage.setItem(STORAGE_KEY_PLAYING, "false");
  }, [pause, cancelPlayTimer]);

  // ── Event listeners on BOTH audio elements ─────────────────────────────

  useEffect(() => {
    const audioA = audioARef.current;
    const audioB = audioBRef.current;
    if (!audioA || !audioB) return;

    const isActiveAudio = (el: EventTarget | null) => {
      if (activeSlotRef.current === 0) return el === audioA;
      return el === audioB;
    };

    const onTimeUpdate = (e: Event) => {
      if (isActiveAudio(e.target)) {
        setCurrentTime((e.target as HTMLAudioElement).currentTime);
      }
    };
    const onDurationChange = (e: Event) => {
      if (isActiveAudio(e.target)) {
        setDuration((e.target as HTMLAudioElement).duration || 0);
      }
    };
    const onEnded = (e: Event) => {
      if (isActiveAudio(e.target)) advanceToNext();
    };
    const onPlay = (e: Event) => {
      if (isActiveAudio(e.target)) setIsPlaying(true);
    };
    const onPause = (e: Event) => {
      if (isActiveAudio(e.target)) setIsPlaying(false);
    };

    for (const el of [audioA, audioB]) {
      el.addEventListener("timeupdate", onTimeUpdate);
      el.addEventListener("durationchange", onDurationChange);
      el.addEventListener("ended", onEnded);
      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
    }

    return () => {
      for (const el of [audioA, audioB]) {
        el.removeEventListener("timeupdate", onTimeUpdate);
        el.removeEventListener("durationchange", onDurationChange);
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
      }
    };
  }, [advanceToNext]);

  // ── Persist player state to localStorage ────────────────────────────────

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_INDEX, String(currentIndex));
  }, [currentIndex]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHUFFLE, String(isShuffled));
  }, [isShuffled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PLAYING, String(isPlaying));
  }, [isPlaying]);

  // Persist current time periodically (every 5 seconds to avoid thrashing)
  const lastSavedTimeRef = useRef(0);
  useEffect(() => {
    if (Math.abs(currentTime - lastSavedTimeRef.current) >= 5) {
      lastSavedTimeRef.current = currentTime;
      localStorage.setItem(STORAGE_KEY_TIME, String(currentTime));
    }
  }, [currentTime]);

  // ── Media Session API (lock screen controls) ───────────────────────────

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

    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
  }, [songs, currentIndex, isPlaying, play, pause, previous, next, seek]);

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
      }}
    >
      <audio ref={audioARef} preload="auto" />
      <audio ref={audioBRef} preload="auto" />
      {children}
    </MusicPlayerContext.Provider>
  );
}
