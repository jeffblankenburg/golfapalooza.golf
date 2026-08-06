"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface WalkupSong {
  id: string;
  title: string;
  mp3_url: string;
  art_thumb_url: string | null;
  art_url: string | null;
  duration_seconds: number | null;
}

interface WalkupRow {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  handicap: number | null;
  group_number: number | null;
  tee_time: string | null;
  songs: WalkupSong[];
  song_id: string | null;
  start_seconds: number;
  sort_order: number;
}

// "0:32" -> 32, "1:05" -> 65, "45" -> 45. Returns null when unparseable.
function parseStart(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const m = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatTeeTime(t: string | null): string | null {
  if (!t) return null;
  // Postgres TIME comes back as "HH:MM:SS"
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let hour = parseInt(m[1], 10);
  const min = m[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${min} ${ampm}`;
}

export function WalkupPlayer() {
  const [rows, setRows] = useState<WalkupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable start-time text buffers, keyed by user_id (only while focused).
  const [startEdits, setStartEdits] = useState<Record<string, string>>({});

  // Playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUserId, setPlayingUserId] = useState<string | null>(null);
  // One-shot "seek then play" listener, cleared if playback is retriggered
  // before the audio finishes loading (avoids stacking seek callbacks).
  const readyHandlerRef = useRef<(() => void) | null>(null);

  // Drag-to-reorder (same hand-rolled pattern as SongManager for touch support)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [touchPreview, setTouchPreview] = useState<{ name: string; y: number } | null>(null);
  const touchCurrentIndex = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/music/walkups");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
      setRows(data.rows || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Wire up the dedicated audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    const onEnded = () => setPlayingUserId(null);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, []);

  const putJson = useCallback(async (payload: unknown) => {
    try {
      const res = await fetch("/api/admin/music/walkups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
    } catch (err) {
      setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Manual drag order — writes sort_order for every row.
  const saveOrder = useCallback(
    (next: WalkupRow[]) =>
      putJson({
        action: "reorder",
        order: next.map((r, i) => ({ user_id: r.user_id, sort_order: i })),
      }),
    [putJson]
  );

  // Per-row song / start-time edit — never touches order.
  const saveMeta = useCallback(
    (row: WalkupRow) =>
      putJson({
        action: "meta",
        user_id: row.user_id,
        song_id: row.song_id,
        start_seconds: row.start_seconds,
      }),
    [putJson]
  );

  const chosenSong = (row: WalkupRow): WalkupSong | null =>
    row.songs.find((s) => s.id === row.song_id) || null;

  const stop = useCallback(() => {
    audioRef.current?.pause();
    setPlayingUserId(null);
  }, []);

  const play = useCallback(
    (row: WalkupRow) => {
      const audio = audioRef.current;
      const song = chosenSong(row);
      if (!audio || !song) return;

      // Toggle off if this row is already playing.
      if (playingUserId === row.user_id && !audio.paused) {
        stop();
        return;
      }

      const start = row.start_seconds || 0;

      // Drop any pending seek-then-play from a prior click that hadn't loaded yet.
      if (readyHandlerRef.current) {
        audio.removeEventListener("canplay", readyHandlerRef.current);
        readyHandlerRef.current = null;
      }

      const startAndPlay = () => {
        try {
          audio.currentTime = start;
        } catch {
          /* seek before metadata — ignore */
        }
        audio
          .play()
          .then(() => setPlayingUserId(row.user_id))
          .catch((err) => setError(`Playback failed: ${err.message}`));
      };

      // Already the loaded song → seek + play immediately.
      if (audio.src === song.mp3_url && audio.readyState >= 2) {
        startAndPlay();
        return;
      }

      // New (or not-yet-buffered) song → load, then seek + play ONCE it's ready.
      audio.src = song.mp3_url;
      const handler = () => {
        audio.removeEventListener("canplay", handler);
        readyHandlerRef.current = null;
        startAndPlay();
      };
      readyHandlerRef.current = handler;
      audio.addEventListener("canplay", handler);
      audio.load();
    },
    [playingUserId, stop]
  );

  // --- reorder ---
  const commitReorder = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return;
      setRows((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        const renumbered = next.map((r, i) => ({ ...r, sort_order: i }));
        void saveOrder(renumbered);
        return renumbered;
      });
    },
    [saveOrder]
  );

  const updateRow = useCallback(
    (userId: string, patch: Partial<WalkupRow>) => {
      setRows((prev) => {
        const next = prev.map((r) => (r.user_id === userId ? { ...r, ...patch } : r));
        const updated = next.find((r) => r.user_id === userId);
        if (updated) void saveMeta(updated);
        return next;
      });
    },
    [saveMeta]
  );

  const resetOrder = useCallback(async () => {
    await putJson({ action: "reset" });
    await fetchRows();
  }, [putJson, fetchRows]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-400">
          {rows.length} {rows.length === 1 ? "player" : "players"}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={resetOrder}
            className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full border border-gray-300 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-50 shadow-sm"
            title="Clear manual drag order and revert to group / tee-time order"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset order
          </button>
          {playingUserId && (
            <button
              onClick={stop}
              className="text-xs font-semibold text-red-600 hover:text-red-700"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-gray-400">
          No rostered players found for the Thursday scramble.
        </div>
      )}

      {/* Floating touch drag preview */}
      {touchPreview && (
        <div className="fixed left-4 right-4 z-50 pointer-events-none" style={{ top: touchPreview.y - 20 }}>
          <div className="bg-green-600 text-white rounded-xl px-4 py-2 shadow-lg text-sm font-medium text-center opacity-90">
            {touchPreview.name}
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100 -mx-4" ref={listRef}>
        {rows.map((row, index) => {
          const song = chosenSong(row);
          const hasSongs = row.songs.length > 0;
          const isPlaying = playingUserId === row.user_id;
          const startText = startEdits[row.user_id] ?? formatTime(row.start_seconds);

          return (
            <div key={row.user_id}>
              {dropTargetIndex === index && dragIndex !== null && dragIndex !== index && (
                <div className="h-1 bg-green-500 rounded-full mx-4" />
              )}
              <div
                data-drag-item
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTargetIndex(index);
                }}
                onDragLeave={() => setDropTargetIndex((p) => (p === index ? null : p))}
                onDrop={() => {
                  if (dragIndex !== null) commitReorder(dragIndex, index);
                  setDragIndex(null);
                  setDropTargetIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropTargetIndex(null);
                }}
                className={`px-4 py-2.5 transition-colors ${
                  dragIndex === index ? "opacity-40 bg-green-50" : ""
                } ${
                  dropTargetIndex === index && dragIndex !== null && dragIndex !== index
                    ? "bg-green-50"
                    : ""
                } ${isPlaying ? "bg-green-50/60" : ""}`}
              >
                <div className="flex items-center gap-2.5">
                  {/* Drag handle */}
                  <div
                    className="text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      touchCurrentIndex.current = index;
                      setDragIndex(index);
                      setDropTargetIndex(index);
                      setTouchPreview({ name: row.display_name, y: touch.clientY });
                    }}
                    onTouchMove={(e) => {
                      if (dragIndex === null || !listRef.current) return;
                      e.preventDefault();
                      const touch = e.touches[0];
                      setTouchPreview((prev) => (prev ? { ...prev, y: touch.clientY } : null));
                      const items = listRef.current.querySelectorAll("[data-drag-item]");
                      for (let i = 0; i < items.length; i++) {
                        const rect = items[i].getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        if (touch.clientY < midY) {
                          touchCurrentIndex.current = i;
                          setDropTargetIndex(i);
                          return;
                        }
                      }
                      touchCurrentIndex.current = items.length - 1;
                      setDropTargetIndex(items.length - 1);
                    }}
                    onTouchEnd={() => {
                      if (dragIndex !== null && touchCurrentIndex.current !== null) {
                        commitReorder(dragIndex, touchCurrentIndex.current);
                      }
                      setDragIndex(null);
                      setDropTargetIndex(null);
                      setTouchPreview(null);
                      touchCurrentIndex.current = null;
                    }}
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0z" />
                    </svg>
                  </div>

                  {/* Order number */}
                  <div className="text-sm font-semibold text-gray-400 tabular-nums w-5 text-right flex-shrink-0">
                    {index + 1}
                  </div>

                  {/* Avatar */}
                  {row.avatar_url ? (
                    <img src={row.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-500 flex-shrink-0">
                      {row.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate leading-tight">
                      {row.display_name}
                    </div>
                    <div className="text-xs text-gray-400 truncate flex items-center gap-1.5">
                      {row.group_number != null ? (
                        <span>
                          Group {row.group_number}
                          {row.tee_time ? ` · ${formatTeeTime(row.tee_time)}` : ""}
                        </span>
                      ) : (
                        <span className="text-amber-600">No group</span>
                      )}
                      <span aria-hidden>·</span>
                      <span>{row.handicap != null ? `${row.handicap.toFixed(1)} HCP` : "No HCP"}</span>
                    </div>
                  </div>

                  {/* Play button */}
                  <button
                    onClick={() => play(row)}
                    disabled={!song}
                    aria-label={isPlaying ? "Pause" : "Play"}
                    className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm transition-colors ${
                      song
                        ? isPlaying
                          ? "bg-green-700 text-white"
                          : "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-100 text-gray-300 cursor-not-allowed"
                    }`}
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Song row: selector / label / warning + start time */}
                <div className="mt-2 ml-[3.75rem] flex items-center gap-2 flex-wrap">
                  {!hasSongs ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-2.99l-6.93-12a2 2 0 00-3.48 0l-6.93 12A2 2 0 005.07 19z" />
                      </svg>
                      No song assigned
                    </span>
                  ) : row.songs.length > 1 ? (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="text-[0.625rem] uppercase tracking-wide text-purple-600 font-bold bg-purple-50 rounded px-1.5 py-0.5 flex-shrink-0">
                        {row.songs.length} songs
                      </span>
                      <select
                        value={row.song_id ?? ""}
                        onChange={(e) => updateRow(row.user_id, { song_id: e.target.value || null })}
                        className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-transparent"
                      >
                        <option value="">Choose a song…</option>
                        {row.songs.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.title}
                            {s.duration_seconds ? ` (${formatTime(s.duration_seconds)})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 text-sm text-gray-600 truncate">
                      <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                      </svg>
                      <span className="truncate">{song?.title}</span>
                    </div>
                  )}

                  {/* Start time */}
                  {song && (
                    <label className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
                      <span>Start</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={startText}
                        placeholder="0:00"
                        onFocus={() =>
                          setStartEdits((p) => ({ ...p, [row.user_id]: formatTime(row.start_seconds) }))
                        }
                        onChange={(e) =>
                          setStartEdits((p) => ({ ...p, [row.user_id]: e.target.value }))
                        }
                        onBlur={() => {
                          const parsed = parseStart(startText);
                          setStartEdits((p) => {
                            const next = { ...p };
                            delete next[row.user_id];
                            return next;
                          });
                          if (parsed != null && parsed !== row.start_seconds) {
                            updateRow(row.user_id, { start_seconds: parsed });
                          }
                        }}
                        className="w-14 border border-gray-300 rounded-md px-2 py-1 text-sm text-center tabular-nums"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
