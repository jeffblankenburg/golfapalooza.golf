"use client";

import { useEffect, useMemo, useState } from "react";

interface SongRow {
  song_id: string;
  title: string;
  art_url: string | null;
  play_count: number;
}

type SortCol = "title" | "plays";
type SortDir = "asc" | "desc";

function SortArrow({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return null;
  return (
    <svg
      className={`w-3 h-3 inline-block ml-0.5 transition-transform ${
        dir === "asc" ? "rotate-180" : ""
      }`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export function UserSongsTab({ userId }: { userId: string }) {
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  const [totalPlays, setTotalPlays] = useState(0);
  const [error, setError] = useState("");
  const [sortCol, setSortCol] = useState<SortCol>("plays");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/users/${userId}/songs`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d.error || "Failed to load songs");
          setSongs([]);
          return;
        }
        setSongs(d.songs || []);
        setTotalPlays(d.total_plays || 0);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load songs");
          setSongs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sorted = useMemo(() => {
    if (!songs) return [];
    const copy = [...songs];
    const mult = sortDir === "asc" ? 1 : -1;
    if (sortCol === "title") {
      copy.sort((a, b) => a.title.localeCompare(b.title) * mult);
    } else {
      copy.sort((a, b) => (a.play_count - b.play_count) * mult);
    }
    return copy;
  }, [songs, sortCol, sortDir]);

  const toggleSort = (col: SortCol) => {
    if (col === sortCol) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "plays" ? "desc" : "asc");
    }
  };

  if (songs === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-red-600 py-4">{error}</p>;

  if (songs.length === 0) {
    return <p className="text-sm text-gray-400 italic py-6 text-center">No song plays yet.</p>;
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">
        {songs.length} song{songs.length === 1 ? "" : "s"} · {totalPlays} total play{totalPlays === 1 ? "" : "s"}
      </p>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 bg-gray-50 rounded-t-xl text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <div className="w-9 flex-shrink-0" />
        <button
          type="button"
          onClick={() => toggleSort("title")}
          className={`flex-1 text-left flex items-center min-w-0 active:text-gray-700 ${
            sortCol === "title" ? "text-green-700" : ""
          }`}
        >
          Name
          <SortArrow active={sortCol === "title"} dir={sortDir} />
        </button>
        <button
          type="button"
          onClick={() => toggleSort("plays")}
          className={`flex-shrink-0 flex items-center active:text-gray-700 ${
            sortCol === "plays" ? "text-green-700" : ""
          }`}
        >
          Plays
          <SortArrow active={sortCol === "plays"} dir={sortDir} />
        </button>
      </div>

      <div className="border border-t-0 border-gray-200 rounded-b-xl divide-y divide-gray-100 bg-white">
        {sorted.map((s) => (
          <div key={s.song_id} className="flex items-center gap-3 px-3 py-2">
            {s.art_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.art_url} alt="" className="w-9 h-9 rounded-md object-cover flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-md bg-gray-100 flex-shrink-0 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zm12-3a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            )}
            <p className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">{s.title}</p>
            <span className="text-sm font-bold text-gray-900 flex-shrink-0 tabular-nums">
              {s.play_count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
