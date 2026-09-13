"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickName, type NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface WalkupSong {
  id: string;
  title: string;
  mp3_url: string;
  art_url: string | null;
  art_thumb_url: string | null;
  duration_seconds: number | null;
}
interface WRow {
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  songs: WalkupSong[];
  song_id: string | null;
  start_seconds: number;
  sort_order: number;
}

function mmss(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

export default function WalkupManager({ orgId, nameMode }: { orgId: string; nameMode: NameMode }) {
  const [rows, setRows] = useState<WRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playFrom, setPlayFrom] = useState<number | null>(null); // announcer start index, or null (closed)

  const fetchRows = useCallback(async (): Promise<WRow[]> => {
    const r = await fetch(`/api/v2/music/walkups?orgId=${orgId}`);
    if (!r.ok) {
      setError((await r.json().catch(() => ({}))).error || "Could not load walk-ups");
      return [];
    }
    return (await r.json()).rows || [];
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const r = await fetchRows();
      if (!active) return;
      setRows(r);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchRows]);

  async function saveMeta(userId: string, songId: string | null, startSeconds: number) {
    await fetch("/api/v2/music/walkups", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, action: "meta", user_id: userId, song_id: songId, start_seconds: startSeconds }),
    });
  }

  function setSong(userId: string, songId: string) {
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, song_id: songId || null } : r)));
    const row = rows.find((r) => r.user_id === userId);
    saveMeta(userId, songId || null, row?.start_seconds ?? 0);
  }
  function setStart(userId: string, seconds: number) {
    const s = Math.max(0, Math.round(seconds) || 0);
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, start_seconds: s } : r)));
    const row = rows.find((r) => r.user_id === userId);
    saveMeta(userId, row?.song_id ?? null, s);
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[index], next[j]] = [next[j], next[index]];
    const reindexed = next.map((r, i) => ({ ...r, sort_order: i }));
    setRows(reindexed);
    const res = await fetch("/api/v2/music/walkups", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, action: "reorder", order: reindexed.map((r) => ({ user_id: r.user_id, sort_order: r.sort_order })) }),
    });
    if (!res.ok) setRows(await fetchRows());
  }

  async function resetOrder() {
    await fetch("/api/v2/music/walkups", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, action: "reset" }),
    });
    setRows(await fetchRows());
  }

  // The announcer plays only rows that have a resolved song, in list order.
  const playable = rows.filter((r) => r.song_id && r.songs.some((s) => s.id === r.song_id));

  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Walk-ups</h1>
        <button
          type="button"
          className={styles.createBtn}
          style={{ padding: "8px 16px" }}
          disabled={playable.length === 0}
          onClick={() => setPlayFrom(0)}
        >
          ▶ Play
        </button>
      </div>

      <p className={styles.swatchHint} style={{ marginTop: 0 }}>
        Roster order for the announcer. Each Loozer walks up to their tagged song, starting at the set time. Drag order
        with the arrows; pick a song when a Loozer has more than one.
      </p>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.section}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p className={styles.sectionLabel} style={{ margin: 0 }}>Order ({rows.length})</p>
          <button type="button" className={styles.createBtnGhost} style={{ padding: "5px 11px" }} onClick={resetOrder}>
            Reset order
          </button>
        </div>

        {loading ? (
          <p className={styles.dnsHint}>Loading…</p>
        ) : rows.length === 0 ? (
          <p className={styles.dnsHint}>
            No roster yet. Add an active event with participants (or members), and tag songs to Loozers in the Music
            library.
          </p>
        ) : (
          <ul className={styles.memberList} style={{ marginTop: 12 }}>
            {rows.map((r, i) => (
              <li key={r.user_id} className={styles.memberRow} style={{ gap: 8, alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingTop: 2 }}>
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}
                    style={{ opacity: i === 0 ? 0.25 : 0.7, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", padding: 2 }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}
                    style={{ opacity: i === rows.length - 1 ? 0.25 : 0.7, background: "none", border: "none", cursor: i === rows.length - 1 ? "default" : "pointer", padding: 2 }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
                {r.avatar_url ? (
                  <img src={r.avatar_url} alt="" className={styles.memberAvatar} />
                ) : (
                  <span className={styles.memberAvatar}>{pickName(r, nameMode).charAt(0).toUpperCase()}</span>
                )}
                <div className={styles.memberMeta} style={{ flex: 1, gap: 6 }}>
                  <span className={styles.memberName}>{pickName(r, nameMode)}</span>
                  {r.songs.length === 0 ? (
                    <span className={styles.memberSub} style={{ color: "var(--danger, #b91c1c)" }}>No tagged song</span>
                  ) : r.songs.length === 1 ? (
                    <span className={styles.memberSub}>{r.songs[0].title}</span>
                  ) : (
                    <select
                      className={styles.roleSelect}
                      value={r.song_id || ""}
                      onChange={(e) => setSong(r.user_id, e.target.value)}
                      style={{ maxWidth: 220 }}
                    >
                      <option value="">Pick a song…</option>
                      {r.songs.map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  )}
                  {r.song_id && (
                    <label className={styles.memberSub} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      Start at
                      <input
                        type="number"
                        min={0}
                        value={r.start_seconds}
                        onChange={(e) => setStart(r.user_id, Number(e.target.value))}
                        style={{ width: 64, padding: "2px 6px", border: "1px solid var(--line)", borderRadius: 6 }}
                      />
                      sec ({mmss(r.start_seconds)})
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {playFrom !== null && (
        <Announcer
          playlist={playable}
          startIndex={Math.min(playFrom, Math.max(0, playable.length - 1))}
          nameMode={nameMode}
          onClose={() => setPlayFrom(null)}
        />
      )}
    </>
  );
}

/* ── Full-screen announcer ─────────────────────────────────────────────────── */
function Announcer({
  playlist,
  startIndex,
  nameMode,
  onClose,
}: {
  playlist: WRow[];
  startIndex: number;
  nameMode: NameMode;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const [playing, setPlaying] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  const row = playlist[index];
  const song = row?.songs.find((s) => s.id === row.song_id) || null;

  const go = useCallback(
    (i: number) => {
      if (i < 0 || i >= playlist.length) return;
      setIndex(i);
      setPlaying(true);
    },
    [playlist.length],
  );

  // Load + play the current song from its start offset whenever the track changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !song) return;
    el.src = song.mp3_url;
    const onMeta = () => {
      el.currentTime = row?.start_seconds ?? 0;
      el.play().catch(() => {});
    };
    el.addEventListener("loadedmetadata", onMeta, { once: true });
    el.load();
    return () => el.removeEventListener("loadedmetadata", onMeta);
  }, [song, row?.start_seconds]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, onClose]);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  if (!row) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-black text-white flex flex-col items-center justify-center px-6">
      <audio ref={audioRef} onEnded={() => (index + 1 < playlist.length ? go(index + 1) : onClose())} />

      <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-white/70">
        <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <p className="text-white/50 text-sm mb-4">
        {index + 1} of {playlist.length}
      </p>

      {song?.art_url || row.avatar_url ? (
        <img src={song?.art_url || row.avatar_url || ""} alt="" className="w-56 h-56 rounded-2xl object-cover shadow-2xl" />
      ) : (
        <div className="w-56 h-56 rounded-2xl bg-white/10 flex items-center justify-center text-6xl">♪</div>
      )}

      <h2 className="mt-8 text-4xl font-bold text-center">{pickName(row, nameMode)}</h2>
      {song && <p className="mt-2 text-lg text-white/70 text-center">{song.title}</p>}

      <div className="mt-10 flex items-center gap-8">
        <button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous" className="disabled:opacity-30">
          <svg width="34" height="34" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
        </button>
        <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center">
          {playing ? (
            <svg width="34" height="34" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
          ) : (
            <svg width="34" height="34" fill="currentColor" viewBox="0 0 24 24" className="ml-1"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button onClick={() => go(index + 1)} disabled={index === playlist.length - 1} aria-label="Next" className="disabled:opacity-30">
          <svg width="34" height="34" fill="currentColor" viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z" /></svg>
        </button>
      </div>

      {index + 1 < playlist.length && (
        <p className="mt-10 text-white/40 text-sm">Up next: {pickName(playlist[index + 1], nameMode)}</p>
      )}
    </div>
  );
}
