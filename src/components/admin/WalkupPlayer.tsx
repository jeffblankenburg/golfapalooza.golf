"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";

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
  full_name: string | null;
  city: string | null;
  state: string | null;
  years_attended: number;
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
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatTeeTime(t: string | null): string | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let hour = parseInt(m[1], 10);
  const min = m[2];
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${min} ${ampm}`;
}

function hometown(row: WalkupRow): string | null {
  if (row.city && row.state) return `${row.city}, ${row.state}`;
  return row.city || row.state || null;
}

export function WalkupPlayer() {
  const router = useRouter();
  const [rows, setRows] = useState<WalkupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Playback (single shared audio element)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const readyHandlerRef = useRef<(() => void) | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Prep modal
  const [modalUserId, setModalUserId] = useState<string | null>(null);

  // Drag-to-reorder (within a group only)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
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

  // Wire the audio element once.
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    const onTime = () => setCurrentTime(audio.currentTime);
    const onDur = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(audio.duration || 0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audioRef.current = null;
    };
  }, []);

  const chosenSong = useCallback(
    (row: WalkupRow): WalkupSong | null => row.songs.find((s) => s.id === row.song_id) || null,
    []
  );

  // Load a song into the shared element, optionally seeking + playing.
  const loadInto = useCallback(
    (row: WalkupRow, fromSeconds: number, autoplay: boolean) => {
      const audio = audioRef.current;
      const song = chosenSong(row);
      if (!audio || !song) return;

      if (readyHandlerRef.current) {
        audio.removeEventListener("canplay", readyHandlerRef.current);
        readyHandlerRef.current = null;
      }

      const go = () => {
        try {
          audio.currentTime = fromSeconds;
        } catch {
          /* pre-metadata seek — ignore */
        }
        setCurrentTime(fromSeconds);
        setLoadedUserId(row.user_id);
        setDuration(Number.isFinite(audio.duration) ? audio.duration : song.duration_seconds || 0);
        if (autoplay) {
          audio.play().catch((err) => setError(`Playback failed: ${err.message}`));
        }
      };

      if (audio.src === song.mp3_url && audio.readyState >= 2) {
        go();
        return;
      }
      audio.src = song.mp3_url;
      const handler = () => {
        audio.removeEventListener("canplay", handler);
        readyHandlerRef.current = null;
        go();
      };
      readyHandlerRef.current = handler;
      audio.addEventListener("canplay", handler);
      audio.load();
    },
    [chosenSong]
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  // Row Play (live): play the chosen song from its saved start offset.
  const playFromStart = useCallback(
    (row: WalkupRow) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (loadedUserId === row.user_id && isPlaying) {
        stop();
        return;
      }
      loadInto(row, row.start_seconds || 0, true);
    },
    [loadedUserId, isPlaying, loadInto, stop]
  );

  // --- persistence ---
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

  const saveOrder = useCallback(
    (next: WalkupRow[]) =>
      putJson({ action: "reorder", order: next.map((r, i) => ({ user_id: r.user_id, sort_order: i })) }),
    [putJson]
  );

  const saveMeta = useCallback(
    (row: WalkupRow) =>
      putJson({ action: "meta", user_id: row.user_id, song_id: row.song_id, start_seconds: row.start_seconds }),
    [putJson]
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

  // Reorder within the flat list (callers guarantee same-group).
  const commitReorder = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return;
      setRows((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        void saveOrder(next);
        return next;
      });
    },
    [saveOrder]
  );

  // Group the flat, ordered rows into contiguous bordered sections.
  const groups = useMemo(() => {
    const out: { key: string; label: string | null; teeTime: string | null; items: WalkupRow[] }[] = [];
    for (const row of rows) {
      const key = row.group_number != null ? `g${row.group_number}` : "none";
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = {
          key,
          label: row.group_number != null ? `Group ${row.group_number}` : "Unassigned",
          teeTime: row.tee_time,
          items: [],
        };
        out.push(g);
      }
      g.items.push(row);
    }
    return out;
  }, [rows]);

  const indexByUser = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.user_id, i));
    return m;
  }, [rows]);

  const modalRow = modalUserId ? rows.find((r) => r.user_id === modalUserId) || null : null;

  const closeModal = useCallback(() => {
    stop();
    setModalUserId(null);
  }, [stop]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Top bar — the only chrome */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.push("/admin/music")}
          aria-label="Close"
          className="w-11 h-11 -ml-1 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 flex-shrink-0"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Walk-Up Player</h1>
        <button
          onClick={resetOrder}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-gray-300 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
          title="Clear manual order and revert to group order"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset
        </button>
      </div>

      <div className="flex-1 px-4 py-4 max-w-2xl w-full mx-auto">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-base text-red-700">
            {error}
          </div>
        )}

        {rows.length === 0 && (
          <div className="px-4 py-12 text-center text-lg text-gray-400">
            No rostered players found for the Thursday scramble.
          </div>
        )}

        <div ref={listRef} className="space-y-5">
          {groups.map((group) => (
            <section key={group.key} className="rounded-2xl border-2 border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200">
                <span className="text-sm font-bold uppercase tracking-wide text-gray-500">{group.label}</span>
                {group.teeTime && (
                  <span className="text-sm font-semibold text-gray-500">{formatTeeTime(group.teeTime)}</span>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {group.items.map((row) => {
                  const flatIndex = indexByUser.get(row.user_id)!;
                  const song = chosenSong(row);
                  const rowPlaying = loadedUserId === row.user_id && isPlaying;
                  const sameGroupDrag =
                    dragIndex != null &&
                    rows[dragIndex]?.group_number === row.group_number;
                  return (
                    <div
                      key={row.user_id}
                      data-drag-item
                      draggable
                      onDragStart={() => setDragIndex(flatIndex)}
                      onDragOver={(e) => {
                        if (!sameGroupDrag) return;
                        e.preventDefault();
                        setDropTargetIndex(flatIndex);
                      }}
                      onDrop={() => {
                        if (dragIndex != null && sameGroupDrag) commitReorder(dragIndex, flatIndex);
                        setDragIndex(null);
                        setDropTargetIndex(null);
                      }}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropTargetIndex(null);
                      }}
                      className={`px-3 py-3 transition-colors ${
                        dragIndex === flatIndex ? "opacity-40 bg-green-50" : ""
                      } ${
                        dropTargetIndex === flatIndex && sameGroupDrag && dragIndex !== flatIndex
                          ? "bg-green-50"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Drag handle */}
                        <div className="text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0zm-8 6a2 2 0 112 0 2 2 0 01-2 0zm8 0a2 2 0 112 0 2 2 0 01-2 0z" />
                          </svg>
                        </div>

                        {/* Player (tap to open prep modal) */}
                        <button
                          type="button"
                          onClick={() => {
                            setModalUserId(row.user_id);
                            // Preload (no autoplay) so the scrubber is live immediately.
                            if (chosenSong(row)) loadInto(row, row.start_seconds || 0, false);
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="relative flex-shrink-0">
                            {row.avatar_url ? (
                              <img src={row.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-xl font-bold text-gray-500">
                                {row.display_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            {row.handicap != null && (
                              <span
                                className="absolute -bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[1.5rem] px-1.5 h-6 rounded-full bg-gray-900 text-white text-xs font-bold tabular-nums border-2 border-white shadow-sm"
                                title={`${row.handicap.toFixed(1)} handicap`}
                              >
                                {row.handicap.toFixed(1)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xl font-bold text-gray-900 truncate leading-tight">
                                {row.display_name}
                              </span>
                              {row.years_attended > 0 && (
                                <span
                                  className="flex-shrink-0 inline-flex items-center justify-center px-2.5 py-0.5 rounded-md bg-green-600 text-white text-xl font-bold tabular-nums leading-tight"
                                  title={`${row.years_attended} ${row.years_attended === 1 ? "year" : "years"} attended`}
                                >
                                  {row.years_attended}
                                </span>
                              )}
                            </div>
                            {row.full_name && row.full_name !== row.display_name && (
                              <div className="text-lg text-gray-700 truncate leading-tight">{row.full_name}</div>
                            )}
                            {hometown(row) && (
                              <div className="text-lg text-gray-500 truncate leading-tight">{hometown(row)}</div>
                            )}
                          </div>
                        </button>

                        {/* Live Play button */}
                        <button
                          onClick={() => playFromStart(row)}
                          disabled={!song}
                          aria-label={rowPlaying ? "Pause" : "Play"}
                          className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm transition-colors ${
                            song
                              ? rowPlaying
                                ? "bg-green-700 text-white"
                                : "bg-green-600 text-white hover:bg-green-700"
                              : "bg-gray-100 text-gray-300 cursor-not-allowed"
                          }`}
                        >
                          {rowPlaying ? (
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

                      {/* Song / start-time — full width, runs under the play button */}
                      <button
                        type="button"
                        onClick={() => {
                          setModalUserId(row.user_id);
                          if (chosenSong(row)) loadInto(row, row.start_seconds || 0, false);
                        }}
                        className="block w-full text-left text-base mt-2 truncate"
                      >
                        {song ? (
                          <span className="text-gray-600">
                            🎵 {song.title}
                            <span className="text-gray-400"> · {formatTime(row.start_seconds)}</span>
                          </span>
                        ) : (
                          <span className="text-amber-700 font-semibold">⚠ No song assigned</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      {modalRow && (
        <WalkupModal
          row={modalRow}
          loadedUserId={loadedUserId}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          onClose={closeModal}
          onSeek={(t) => {
            const audio = audioRef.current;
            if (audio) {
              audio.currentTime = t;
              setCurrentTime(t);
            }
          }}
          onTogglePlay={() => {
            const audio = audioRef.current;
            if (!audio) return;
            if (loadedUserId === modalRow.user_id && isPlaying) audio.pause();
            else loadInto(modalRow, loadedUserId === modalRow.user_id ? currentTime : modalRow.start_seconds, true);
          }}
          onChangeSong={(songId) => updateRow(modalRow.user_id, { song_id: songId })}
          onChangeStart={(seconds) => updateRow(modalRow.user_id, { start_seconds: seconds })}
        />
      )}
    </div>
  );
}

function WalkupModal({
  row,
  loadedUserId,
  isPlaying,
  currentTime,
  duration,
  onClose,
  onSeek,
  onTogglePlay,
  onChangeSong,
  onChangeStart,
}: {
  row: WalkupRow;
  loadedUserId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onClose: () => void;
  onSeek: (t: number) => void;
  onTogglePlay: () => void;
  onChangeSong: (songId: string | null) => void;
  onChangeStart: (seconds: number) => void;
}) {
  const song = row.songs.find((s) => s.id === row.song_id) || null;
  const isActive = loadedUserId === row.user_id;
  const max = duration || song?.duration_seconds || 0;
  const scrub = isActive ? currentTime : row.start_seconds;
  const [startText, setStartText] = useState(formatTime(row.start_seconds));

  // start_seconds only changes from this modal's own controls, so sync the
  // editing buffer imperatively in those handlers (no effect needed).
  const setStart = (seconds: number) => {
    onChangeStart(seconds);
    setStartText(formatTime(seconds));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl max-h-[92dvh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-center gap-3">
          {row.avatar_url ? (
            <img src={row.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-500 flex-shrink-0">
              {row.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold text-gray-900 truncate">{row.display_name}</div>
            {row.full_name && row.full_name !== row.display_name && (
              <div className="text-sm text-gray-500 truncate">{row.full_name}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-green-600 text-white text-base font-semibold rounded-lg active:bg-green-700 flex-shrink-0"
          >
            Done
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Song picker */}
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1">Song</label>
            {row.songs.length === 0 ? (
              <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-base font-semibold text-amber-700">
                ⚠ No song assigned to {row.display_name}
              </div>
            ) : row.songs.length === 1 ? (
              <div className="text-lg text-gray-800">{row.songs[0].title}</div>
            ) : (
              <select
                value={row.song_id ?? ""}
                onChange={(e) => onChangeSong(e.target.value || null)}
                className="w-full border border-gray-300 rounded-xl px-3 py-3 text-lg bg-transparent"
              >
                <option value="">Choose a song…</option>
                {row.songs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                    {s.duration_seconds ? ` (${formatTime(s.duration_seconds)})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {song && (
            <>
              {/* Scrubber + transport */}
              <div className="space-y-2">
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, Math.floor(max))}
                  step={1}
                  value={Math.min(scrub, max || scrub)}
                  onChange={(e) => onSeek(Number(e.target.value))}
                  className="w-full accent-green-600 h-2"
                />
                <div className="flex items-center justify-between text-base font-mono tabular-nums text-gray-600">
                  <span>{formatTime(scrub)}</span>
                  <span>{max ? formatTime(max) : "--:--"}</span>
                </div>
                <div className="flex items-center justify-center gap-4 pt-1">
                  <button
                    onClick={() => onSeek(Math.max(0, scrub - 5))}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-base font-semibold text-gray-700"
                    aria-label="Back 5 seconds"
                  >
                    −5s
                  </button>
                  <button
                    onClick={onTogglePlay}
                    className="w-16 h-16 rounded-full bg-green-600 text-white flex items-center justify-center shadow-sm active:bg-green-700"
                    aria-label={isActive && isPlaying ? "Pause" : "Play"}
                  >
                    {isActive && isPlaying ? (
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => onSeek(Math.min(max || scrub + 5, scrub + 5))}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-base font-semibold text-gray-700"
                    aria-label="Forward 5 seconds"
                  >
                    +5s
                  </button>
                </div>
              </div>

              {/* Start time */}
              <div className="rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-gray-700">Walk-up starts at</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={startText}
                    onChange={(e) => setStartText(e.target.value)}
                    onBlur={() => {
                      const parsed = parseStart(startText);
                      if (parsed != null) setStart(parsed);
                      else setStartText(formatTime(row.start_seconds));
                    }}
                    className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-xl text-center font-mono tabular-nums"
                  />
                </div>
                <button
                  onClick={() => setStart(Math.floor(scrub))}
                  className="w-full py-3 rounded-lg bg-gray-900 text-white text-base font-semibold active:bg-black"
                >
                  Set start to {formatTime(scrub)}
                </button>
                <p className="text-sm text-gray-400">
                  Scrub to the moment you want, then set it. Playing on the list starts here.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
