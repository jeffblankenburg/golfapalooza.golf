"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { pickName, type NameMode } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface TaggedUser {
  id: string;
  display_name: string;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
}
interface Song {
  id: string;
  title: string;
  mp3_url: string;
  art_url: string | null;
  art_thumb_url: string | null;
  lyrics: string | null;
  duration_seconds: number | null;
  sort_order: number;
  tagged_user: TaggedUser | null;
  play_count: number;
  like_count: number;
}
interface MemberLite {
  user_id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}

function fmtDuration(s: number | null): string {
  if (!s || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Read an audio file's duration (seconds) client-side. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement("audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      URL.revokeObjectURL(el.src);
      resolve(Number.isFinite(d) ? Math.round(d) : null);
    };
    el.onerror = () => resolve(null);
    el.src = URL.createObjectURL(file);
  });
}

export default function MusicManager({ orgId, nameMode }: { orgId: string; nameMode: NameMode }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Song | "new" | null>(null);

  // Editor fields.
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [taggedId, setTaggedId] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artFile, setArtFile] = useState<File | null>(null);
  const [artPreview, setArtPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const audioRef = useRef<HTMLInputElement>(null);
  const artRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    const r = await fetch(`/api/v2/music?orgId=${orgId}&admin=1`);
    return r.ok ? r.json() : { songs: [], members: [] };
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const data = await fetchAll();
      if (!active) return;
      setSongs(data.songs || []);
      setMembers(data.members || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchAll]);

  const sortedMembers = useMemo(() => {
    const key = (m: MemberLite) =>
      (nameMode === "real"
        ? (m.last_name || "").trim() || (m.first_name || "").trim() || m.display_name
        : (m.nickname || "").trim() || m.display_name
      ).toLowerCase();
    return [...members].sort((a, b) => key(a).localeCompare(key(b)));
  }, [members, nameMode]);

  function resetEditor() {
    setTitle("");
    setLyrics("");
    setTaggedId("");
    setAudioFile(null);
    setArtFile(null);
    setArtPreview(null);
    setError(null);
    setProgress(null);
  }

  function openNew() {
    resetEditor();
    setEditing("new");
  }
  function openEdit(s: Song) {
    resetEditor();
    setTitle(s.title);
    setLyrics(s.lyrics || "");
    setTaggedId(s.tagged_user?.id || "");
    setArtPreview(s.art_url || s.art_thumb_url || null);
    setEditing(s);
  }

  async function refresh() {
    const data = await fetchAll();
    setSongs(data.songs || []);
  }

  /** Upload a file to a signed URL. */
  async function putSigned(signedUrl: string, file: File, contentType: string) {
    const res = await fetch(signedUrl, { method: "PUT", body: file, headers: { "content-type": contentType } });
    if (!res.ok) throw new Error("Upload failed");
  }

  async function save() {
    if (busy) return;
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    const isNew = editing === "new";
    if (isNew && !audioFile) {
      setError("Choose an audio file.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      if (isNew) {
        setProgress("Uploading…");
        const duration = audioFile ? await readDuration(audioFile) : null;
        const urlRes = await fetch("/api/v2/music/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgId, hasArt: !!artFile }),
        });
        if (!urlRes.ok) throw new Error((await urlRes.json().catch(() => ({}))).error || "Could not start upload");
        const u = await urlRes.json();
        await putSigned(u.mp3.signedUrl, audioFile!, audioFile!.type || "audio/mpeg");
        let artUrl: string | null = null;
        if (artFile && u.art) {
          await putSigned(u.art.signedUrl, artFile, artFile.type || "image/jpeg");
          artUrl = u.art.publicUrl;
        }
        setProgress("Saving…");
        const res = await fetch("/api/v2/music", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId,
            title: title.trim(),
            mp3_url: u.mp3.publicUrl,
            art_url: artUrl,
            art_thumb_url: artUrl,
            lyrics,
            tagged_user_id: taggedId || null,
            duration_seconds: duration,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
      } else {
        // Edit: metadata, plus optional art replacement.
        let artUrl: string | undefined;
        if (artFile) {
          setProgress("Uploading art…");
          const urlRes = await fetch("/api/v2/music/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orgId, hasArt: true }),
          });
          if (!urlRes.ok) throw new Error("Could not upload art");
          const u = await urlRes.json();
          await putSigned(u.art.signedUrl, artFile, artFile.type || "image/jpeg");
          artUrl = u.art.publicUrl;
        }
        setProgress("Saving…");
        const res = await fetch(`/api/v2/music/${(editing as Song).id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            lyrics,
            tagged_user_id: taggedId || null,
            ...(artUrl ? { art_url: artUrl, art_thumb_url: artUrl } : {}),
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
      }
      setEditing(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  async function del() {
    if (editing === "new" || !editing) return;
    const res = await fetch(`/api/v2/music/${editing.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not delete");
      return;
    }
    setEditing(null);
    await refresh();
  }

  // Move a song up/down and persist the new order (optimistic).
  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= songs.length) return;
    const next = [...songs];
    [next[index], next[j]] = [next[j], next[index]];
    const reindexed = next.map((s, i) => ({ ...s, sort_order: i }));
    setSongs(reindexed);
    const res = await fetch("/api/v2/music", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, order: reindexed.map((s) => ({ id: s.id, sort_order: s.sort_order })) }),
    });
    if (!res.ok) refresh(); // revert to server truth on failure
  }

  // ── Editor ──────────────────────────────────────────────────────────────
  if (editing) {
    const isNew = editing === "new";
    return (
      <>
        <button type="button" className={styles.back} onClick={() => setEditing(null)}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
          </svg>
          All songs
        </button>
        <h1 className={styles.title}>{isNew ? "Add song" : "Edit song"}</h1>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className={styles.field}>
            <label className={styles.label}>Title</label>
            <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
          </div>

          {isNew && (
            <div className={styles.field}>
              <label className={styles.label}>Audio file</label>
              <button type="button" className={styles.createBtnGhost} onClick={() => audioRef.current?.click()}>
                {audioFile ? `♪ ${audioFile.name}` : "Choose MP3"}
              </button>
              <input
                ref={audioRef}
                type="file"
                accept="audio/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  setAudioFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>
              Album art <span className={styles.optional}>(optional)</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {artPreview && (
                <img src={artPreview} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", border: "1px solid var(--line)" }} />
              )}
              <button type="button" className={styles.createBtnGhost} onClick={() => artRef.current?.click()}>
                {artFile ? "Change art" : artPreview ? "Replace art" : "Choose image"}
              </button>
            </div>
            <input
              ref={artRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setArtFile(f);
                if (f) setArtPreview(URL.createObjectURL(f));
                e.target.value = "";
              }}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Tagged Loozer <span className={styles.optional}>(the artist / whose song)</span>
            </label>
            <select className={styles.roleSelect} value={taggedId} onChange={(e) => setTaggedId(e.target.value)}>
              <option value="">Nobody</option>
              {sortedMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {pickName(m, nameMode)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Lyrics <span className={styles.optional}>(optional, Markdown)</span>
            </label>
            <textarea className={styles.textarea} value={lyrics} onChange={(e) => setLyrics(e.target.value)} rows={8} />
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.memberEditActions}>
            <button type="submit" className={styles.createBtn} disabled={busy}>
              {busy ? progress || "Working…" : isNew ? "Add song" : "Save changes"}
            </button>
            {!isNew && (
              <button type="button" className={styles.removeBtn} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </form>

        <ConfirmModal
          open={confirmDelete}
          title="Delete song?"
          message={`Delete “${title || "this song"}”? This removes it from the jukebox for everyone.`}
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            del();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      </>
    );
  }

  // ── List ──────────────────────────────────────────────────────────────────
  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Music</h1>
        <button type="button" className={styles.circleAdd} aria-label="Add song" onClick={openNew}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Jukebox ({songs.length})</p>
        {loading ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>Loading…</p>
        ) : songs.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>No songs yet. Tap + above to add one.</p>
        ) : (
          <ul className={styles.memberList}>
            {songs.map((s, i) => (
              <li key={s.id} className={styles.memberRow} style={{ padding: 0, border: "none", gap: 4 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingRight: 2 }}>
                  <button
                    type="button"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    style={{ opacity: i === 0 ? 0.25 : 0.7, background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", padding: 2 }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    disabled={i === songs.length - 1}
                    onClick={() => move(i, 1)}
                    style={{ opacity: i === songs.length - 1 ? 0.25 : 0.7, background: "none", border: "none", cursor: i === songs.length - 1 ? "default" : "pointer", padding: 2 }}
                  >
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
                <button type="button" className={styles.memberRowBtn} onClick={() => openEdit(s)}>
                  {s.art_thumb_url || s.art_url ? (
                    <img src={s.art_thumb_url || s.art_url || ""} alt="" className={styles.memberAvatar} />
                  ) : (
                    <span className={styles.memberAvatar}>♪</span>
                  )}
                  <div className={styles.memberMeta}>
                    <span className={styles.memberName}>{s.title}</span>
                    <span className={styles.memberSub}>
                      {s.tagged_user ? pickName(s.tagged_user, nameMode) : "No Loozer"}
                      {fmtDuration(s.duration_seconds) ? `, ${fmtDuration(s.duration_seconds)}` : ""}
                      {` — ${s.play_count} play${s.play_count === 1 ? "" : "s"}, ${s.like_count} ♥`}
                    </span>
                  </div>
                  <svg className={styles.arrow} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
