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
import { WakeLockKeeper } from "./WakeLockKeeper";
import MusicDrawer from "./MusicDrawer";

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

interface MusicState {
  songs: Song[];
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isShuffled: boolean;
  favoritesOnly: boolean;
  isVisible: boolean;
  isDrawerExpanded: boolean;
}

interface MusicActions {
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

type MusicContextType = MusicState & MusicActions;

const MusicContext = createContext<MusicContextType | null>(null);

export function useV2Music() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useV2Music must be used within MusicProvider");
  return ctx;
}
/** Safe variant that returns null outside the provider. */
export function useV2MusicOptional() {
  return useContext(MusicContext);
}

// Fallback media-notification artwork (the app icon) for songs with no art. A
// well-formed multi-size artwork array keeps Android's background media
// notification "sticky" — a bare notification gets reclaimed by the OS sooner,
// which is a big reason background playback dies on Android. Additive on iOS.
const FALLBACK_ARTWORK: MediaImage[] = [
  { src: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
  { src: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
];

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

export default function MusicProvider({
  orgId,
  children,
}: {
  orgId: string;
  children: ReactNode;
}) {
  // Org-scoped persistence keys (multi-tenant: never bleed state across orgs).
  const K_INDEX = `v2_music_index_${orgId}`;
  const K_SHUFFLE = `v2_music_shuffle_${orgId}`;
  const K_PLAYING = `v2_music_playing_${orgId}`;
  const K_TIME = `v2_music_time_${orgId}`;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const orgIdRef = useRef(orgId);
  useEffect(() => {
    orgIdRef.current = orgId;
  }, [orgId]);

  const [songs, setSongs] = useState<Song[]>([]);
  const [currentIndex, setCurrentIndex] = useState(() => loadStoredNumber(K_INDEX, 0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isShuffled, setIsShuffled] = useState(() => loadStoredBool(K_SHUFFLE, false));
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);

  const shouldAutoResumeRef = useRef(loadStoredBool(K_PLAYING, false));
  const storedTimeRef = useRef(loadStoredNumber(K_TIME, 0));

  // Tracks whether the user WANTS audio playing, independent of the element's
  // actual state. iOS involuntarily pauses <audio> when a standalone PWA is
  // backgrounded; that fires "pause" and flips isPlaying false, but the user
  // didn't pause. We keep this intent (+ persisted K_PLAYING) true through such
  // interruptions to auto-resume on foreground. Only explicit pause()/dismiss()
  // clears it.
  const intendPlayingRef = useRef(loadStoredBool(K_PLAYING, false));
  const setIntendPlaying = useCallback(
    (want: boolean) => {
      intendPlayingRef.current = want;
      if (typeof window !== "undefined") localStorage.setItem(K_PLAYING, String(want));
    },
    [K_PLAYING],
  );

  // Refs for stable access inside callbacks (synced via effects — updating a ref
  // during render is disallowed; actions below also set them imperatively).
  const songsRef = useRef(songs);
  const currentIndexRef = useRef(currentIndex);
  const isShuffledRef = useRef(isShuffled);
  const shuffleOrderRef = useRef(shuffleOrder);
  const favoritesOnlyRef = useRef(favoritesOnly);
  const volumeRef = useRef(volume);
  const isDrawerExpandedRef = useRef(isDrawerExpanded);
  useEffect(() => { songsRef.current = songs; }, [songs]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { isShuffledRef.current = isShuffled; }, [isShuffled]);
  useEffect(() => { shuffleOrderRef.current = shuffleOrder; }, [shuffleOrder]);
  useEffect(() => { favoritesOnlyRef.current = favoritesOnly; }, [favoritesOnly]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isDrawerExpandedRef.current = isDrawerExpanded; }, [isDrawerExpanded]);

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

  // ── Record play after 10s of playback (fire and forget) ────────────────
  const playTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecordedRef = useRef<string | null>(null);
  const cancelPlayTimer = useCallback(() => {
    if (playTimerRef.current) {
      clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
  }, []);
  const startPlayTimer = useCallback(
    (songId: string) => {
      cancelPlayTimer();
      if (lastRecordedRef.current === songId) return;
      playTimerRef.current = setTimeout(() => {
        lastRecordedRef.current = songId;
        fetch("/api/v2/music/plays", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId: orgIdRef.current, songId }),
        }).catch(() => {});
        playTimerRef.current = null;
      }, 10_000);
    },
    [cancelPlayTimer],
  );

  // ── Core playback ──────────────────────────────────────────────────────
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

      if (!audio.src || !audio.src.endsWith(new URL(targetSong.mp3_url).pathname)) {
        audio.src = targetSong.mp3_url;
        audio.load();
      }
      setCurrentIndex(targetIndex);
      currentIndexRef.current = targetIndex;
      audio.play().catch(() => {});
      setIsPlaying(true);
    },
    [startPlayTimer, setIntendPlaying],
  );

  const loadSongs = useCallback(
    (newSongs: Song[]) => {
      setSongs(newSongs);
      songsRef.current = newSongs;
      if (newSongs.length === 0) return;

      const storedIdx = currentIndexRef.current;
      const idx = storedIdx >= 0 && storedIdx < newSongs.length ? storedIdx : 0;
      if (idx !== storedIdx) {
        setCurrentIndex(idx);
        currentIndexRef.current = idx;
      }

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

      if (!audio.currentTime) {
        audio.src = newSongs[idx].mp3_url;
        audio.volume = volumeRef.current;
        audio.load();
      }
    },
    [startPlayTimer],
  );

  // Resume: force-reinitialize the audio pipeline for iOS lock-screen compat.
  const resume = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const savedTime = audio.currentTime;
    audio.pause();
    audio.currentTime = savedTime;
    audio.volume = 0.999; // nudge to force iOS pipeline reattachment
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
      if (targetIdx === currentIndexRef.current && audioRef.current?.src) {
        resume();
        return;
      }
      playIndex(targetIdx);
    },
    [playIndex, resume],
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
    playIndex(computeNextIndex(currentIndexRef.current, 1));
  }, [computeNextIndex, playIndex]);
  const next = useCallback(() => advanceToNext(), [advanceToNext]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (songsRef.current.length === 0) return;
    playIndex(computeNextIndex(currentIndexRef.current, -1));
  }, [computeNextIndex, playIndex]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    volumeRef.current = vol;
    if (audioRef.current) audioRef.current.volume = vol;
  }, []);

  // Ref writes are kept OUT of the setState updaters (updaters must be pure and
  // may double-run in StrictMode). The ref-sync effects above reconcile each ref
  // with its state after commit.
  const toggleShuffle = useCallback(() => {
    if (!isShuffledRef.current) {
      const s = songsRef.current;
      const favOnly = favoritesOnlyRef.current;
      const playlist = favOnly ? s.map((_, i) => i).filter((i) => s[i].is_favorite) : s.map((_, i) => i);
      for (let i = playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
      }
      setShuffleOrder(playlist);
    }
    setIsShuffled((prev) => !prev);
  }, []);

  const toggleFavoritesOnly = useCallback(() => setFavoritesOnly((prev) => !prev), []);

  const toggleFavorite = useCallback((songId: string) => {
    // Read intent BEFORE the optimistic flip (songsRef still holds pre-flip state
    // here — the ref-sync effect updates it after commit), so the method is right.
    const before = songsRef.current.find((s) => s.id === songId);
    setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, is_favorite: !s.is_favorite } : s)));
    if (before) {
      const method = before.is_favorite ? "DELETE" : "POST";
      fetch("/api/v2/music/favorites", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: orgIdRef.current, songId }),
      }).catch(() => {
        setSongs((prev) => prev.map((s) => (s.id === songId ? { ...s, is_favorite: !s.is_favorite } : s)));
      });
    }
  }, []);

  const dismiss = useCallback(() => {
    pause();
    cancelPlayTimer();
    setIsVisible(false);
    setIsDrawerExpanded(false);
    if (typeof window !== "undefined") localStorage.setItem(K_PLAYING, "false");
  }, [pause, cancelPlayTimer, K_PLAYING]);

  // Broadcast so the shell's shared drawer (chat/photos/etc.) steps aside when
  // music takes the screen — one full-screen surface at a time.
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
  const collapseDrawer = useCallback(() => setIsDrawerExpanded(false), []);
  const toggleDrawer = useCallback(() => {
    const willOpen = !isDrawerExpandedRef.current;
    setIsDrawerExpanded(willOpen);
    if (willOpen) {
      setIsVisible(true);
      broadcastOpen();
    }
  }, []);

  // Collapse when another universal drawer takes the screen (music keeps playing).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name && detail.name !== "music") setIsDrawerExpanded(false);
    };
    window.addEventListener("ui:drawer-open", handler);
    return () => window.removeEventListener("ui:drawer-open", handler);
  }, []);

  // Auto-load the catalog once on mount so the drawer works from any page.
  useEffect(() => {
    if (songsRef.current.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/music?orgId=${orgId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const list = (data.songs || []) as Song[];
        if (list.length > 0 && songsRef.current.length === 0) loadSongs(list);
      } catch {
        /* offline / spectator — fine */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  // Report playback position to the OS media notification (read-only; keeps
  // Android treating the session as active media → background playback survives
  // longer + scrubber). Feature-detected + guarded so it no-ops on iOS/old.
  const updatePositionState = useCallback(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (typeof navigator.mediaSession.setPositionState !== "function") return;
    const audio = audioRef.current;
    if (!audio) return;
    const dur = audio.duration;
    if (!Number.isFinite(dur) || dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(Math.max(audio.currentTime, 0), dur),
      });
    } catch {
      // Some browsers throw on transiently-invalid state; ignore.
    }
  }, []);

  // ── Audio element event listeners ──────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      updatePositionState();
    };
    const onDurationChange = () => {
      setDuration(audio.duration || 0);
      updatePositionState();
    };
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
  }, [advanceToNext, updatePositionState]);

  // ── Persist player state ───────────────────────────────────────────────
  useEffect(() => { localStorage.setItem(K_INDEX, String(currentIndex)); }, [currentIndex, K_INDEX]);
  useEffect(() => { localStorage.setItem(K_SHUFFLE, String(isShuffled)); }, [isShuffled, K_SHUFFLE]);
  // NOTE: K_PLAYING is intentionally NOT driven off isPlaying — it tracks user
  // INTENT (written by setIntendPlaying). Persisting raw isPlaying would let an
  // involuntary background pause clobber intent and break cold-start auto-resume.

  const lastSavedTimeRef = useRef(0);
  useEffect(() => {
    if (Math.abs(currentTime - lastSavedTimeRef.current) >= 5) {
      lastSavedTimeRef.current = currentTime;
      localStorage.setItem(K_TIME, String(currentTime));
    }
  }, [currentTime, K_TIME]);

  // ── Resume on return to foreground (iOS PWA background pause) ───────────
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const audio = audioRef.current;
      if (intendPlayingRef.current && audio && audio.paused) resume();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [resume]);

  // ── Media Session (lock screen / CarPlay controls) ─────────────────────
  useEffect(() => {
    if (!("mediaSession" in navigator) || songs.length === 0) return;
    const currentSong = songs[currentIndex];
    if (!currentSong) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.tagged_user?.display_name || "Golfapalooza",
      album: "Golfapalooza",
      artwork: currentSong.art_url
        ? [{ src: currentSong.art_url, sizes: "512x512", type: "image/jpeg" }, ...FALLBACK_ARTWORK]
        : FALLBACK_ARTWORK,
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", async () => resume());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => previous());
    navigator.mediaSession.setActionHandler("nexttrack", () => next());
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime);
    });
  }, [songs, currentIndex, isPlaying, pause, resume, previous, next, seek]);

  return (
    <MusicContext.Provider
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
      <MusicDrawer />
      <WakeLockKeeper />
    </MusicContext.Provider>
  );
}
