"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  THREES_EVENTS,
  reactionKeyLabel,
  type ThreesReactions,
  type ThreesReactionKey,
  type ThreesAnimation,
  type ThreesReaction,
} from "@/lib/v2/contests/threes";
import type { ThreesState } from "@/lib/v2/contests/threes-server";
import type { EspnGameInput } from "@/lib/v2/contests/pickem-server";
import { playSound, unlockAudio } from "@/lib/v2/soundboard-audio";
import ThreesGamePicker from "../ThreesGamePicker";
import styles from "./threes.module.css";
/* eslint-disable @next/next/no-img-element */

const ANIMATIONS: ThreesAnimation[] = ["slam", "confetti", "zoom", "shake", "groan"];
const REACTION_KEYS: ThreesReactionKey[] = [...THREES_EVENTS.map((e) => e.key), "streak_break"];

interface Clip { id: string; name: string; audio_url: string }
interface GifRow { id: string; url: string; label: string | null }

export default function ThreesManager({
  slug,
  orgId,
  apiBase,
  state,
  backHref,
}: {
  slug: string;
  orgId: string;
  apiBase: string;
  state: ThreesState;
  backHref: string;
}) {
  const router = useRouter();
  const { contest, game } = state;
  const boardHref = `/new/${slug}/admin/contests/${contest.id}/board`;
  const liveHref = `/new/${slug}/admin/contests/${contest.id}/live`;

  const [reactions, setReactions] = useState<ThreesReactions>(state.reactions);
  const [streakCap, setStreakCap] = useState<number | null>(state.streakCap);
  const [clips, setClips] = useState<Clip[]>([]);
  const [gifs, setGifs] = useState<GifRow[]>([]);
  const [gamePickerOpen, setGamePickerOpen] = useState(false);
  const [gifModalFor, setGifModalFor] = useState<ThreesReactionKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => setReactions(state.reactions), [state.reactions]);
  useEffect(() => setStreakCap(state.streakCap), [state.streakCap]);

  useEffect(() => {
    fetch(`/api/v2/soundboard?orgId=${orgId}`)
      .then((r) => (r.ok ? r.json() : { sounds: [] }))
      .then((d) => setClips((d.sounds as Clip[]) ?? []))
      .catch(() => setClips([]));
    void loadGifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function loadGifs() {
    const r = await fetch(`/api/v2/orgs/${orgId}/threes-gifs`).catch(() => null);
    if (r?.ok) setGifs(((await r.json()).gifs as GifRow[]) ?? []);
  }

  async function post(body: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`${apiBase}/threes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Something went wrong");
      after?.();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function updateReaction(key: ThreesReactionKey, patch: Partial<ThreesReaction>) {
    setReactions((r) => ({ ...r, [key]: { ...(r[key] as ThreesReaction), ...patch } }));
    setSavedNote(false);
  }

  async function saveReactions() {
    await post({ action: "reactions", reactions, streakCap });
    setSavedNote(true);
  }

  async function uploadGif(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const u = await fetch(`/api/v2/orgs/${orgId}/threes-gifs/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mime: file.type }),
      });
      const ud = await u.json().catch(() => ({}));
      if (!u.ok) throw new Error(ud.error || "Upload failed");
      const put = await fetch(ud.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Upload failed");
      await fetch(`/api/v2/orgs/${orgId}/threes-gifs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ud.publicUrl, path: ud.path, label: file.name }),
      });
      await loadGifs();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteGif(id: string) {
    await fetch(`/api/v2/orgs/${orgId}/threes-gifs/${id}`, { method: "DELETE" }).catch(() => {});
    await loadGifs();
  }

  function toggleGif(key: ThreesReactionKey, url: string) {
    const cur = (reactions[key]?.gifs as string[]) ?? [];
    const next = cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url];
    updateReaction(key, { gifs: next });
  }

  return (
    <div className={styles.manager}>
      <Link href={backHref} className={styles.back}>← Contests</Link>
      <div className={styles.managerHead}>
        <h1 className={styles.managerTitle}>{contest.name}</h1>
        <div className={styles.managerActions}>
          <Link href={liveHref} className={styles.primaryBtn}>Open scorer</Link>
          <a href={boardHref} target="_blank" rel="noopener" className={styles.secondaryBtn}>Open big board ↗</a>
        </div>
      </div>

      {err && <p className={styles.err}>{err}</p>}

      {/* Game card — one team-colored row each */}
      <section className={styles.gameCard}>
        {game ? (
          <>
            <TeamRow team={game.teamA} />
            <TeamRow team={game.teamB} />
            <button
              type="button"
              className={styles.gameClear}
              disabled={busy}
              onClick={() => void post({ action: "clear_game" })}
              aria-label="Clear game"
              title="Clear game"
            >
              ✕
            </button>
          </>
        ) : (
          <button type="button" className={styles.pickGameBtn} onClick={() => setGamePickerOpen(true)}>+ Pick a game</button>
        )}
      </section>

      {/* Reactions */}
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Reactions</h2>

        <div className={styles.capRow}>
          <span className={styles.capLabel}>Max streak</span>
          <input
            type="number"
            min={1}
            className={styles.capInput}
            value={streakCap ?? ""}
            disabled={streakCap === null}
            onChange={(e) => {
              setStreakCap(e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : 1);
              setSavedNote(false);
            }}
          />
          <label className={styles.capNoCap}>
            <input
              type="checkbox"
              checked={streakCap === null}
              onChange={(e) => {
                setStreakCap(e.target.checked ? null : 5);
                setSavedNote(false);
              }}
            />
            No cap
          </label>
          <span className={styles.muted}>Default 5. The cash register fires once per unit (event + streak).</span>
        </div>

        <p className={styles.muted}>What the big board plays for each event (and when a streak breaks). Sounds come from the Soundboard; GIFs from your library, picked at random.</p>
        <div className={styles.reactions}>
          {REACTION_KEYS.map((key) => {
            const r = (reactions[key] as ThreesReaction) ?? { animation: "zoom", gifs: [], soundUrl: null };
            const selectedGifs = gifs.filter((g) => r.gifs.includes(g.url));
            return (
              <div key={key} className={styles.reactionRow}>
                <div className={styles.reactionHead}>
                  <strong>{reactionKeyLabel(key)}</strong>
                </div>
                <div className={styles.reactionFields}>
                  <label className={styles.rf}>
                    <span>Animation</span>
                    <select className={styles.select} value={r.animation} onChange={(e) => updateReaction(key, { animation: e.target.value as ThreesAnimation })}>
                      {ANIMATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </label>
                  <label className={styles.rf}>
                    <span>Sound</span>
                    <div className={styles.soundRow}>
                      <select className={styles.select} value={r.soundUrl ?? ""} onChange={(e) => updateReaction(key, { soundUrl: e.target.value || null })}>
                        <option value="">None</option>
                        {clips.map((c) => <option key={c.id} value={c.audio_url}>{c.name}</option>)}
                      </select>
                      <button type="button" className={styles.playBtn} disabled={!r.soundUrl} onClick={() => { unlockAudio(); if (r.soundUrl) void playSound(r.soundUrl); }} aria-label="Preview">▶</button>
                    </div>
                  </label>
                  <div className={styles.rf}>
                    <span>GIFs</span>
                    <div className={styles.gifThumbs}>
                      {selectedGifs.slice(0, 6).map((g) => <img key={g.id} src={g.url} alt="" className={styles.gifThumb} />)}
                      <button type="button" className={styles.chooseBtn} onClick={() => setGifModalFor(key)}>
                        Choose GIFs ({r.gifs.length})
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.saveRow}>
          {savedNote && <span className={styles.savedNote}>Saved</span>}
          <button type="button" className={styles.primaryBtn} onClick={() => void saveReactions()} disabled={busy}>Save reactions</button>
        </div>
      </section>

      {gamePickerOpen && (
        <ThreesGamePicker
          title="Change game"
          busy={busy}
          onPick={(g: EspnGameInput) => void post({ action: "set_game", game: g }, () => setGamePickerOpen(false))}
          onClose={() => setGamePickerOpen(false)}
        />
      )}

      {gifModalFor && (
        <GifModal
          title={`GIFs for ${reactionKeyLabel(gifModalFor)}`}
          gifs={gifs}
          selected={(reactions[gifModalFor]?.gifs as string[]) ?? []}
          busy={busy}
          onToggle={(url) => toggleGif(gifModalFor, url)}
          onUpload={uploadGif}
          onDelete={deleteGif}
          onClose={() => setGifModalFor(null)}
        />
      )}
    </div>
  );
}

function TeamRow({ team }: { team: { name: string; abbrev: string | null; logo: string | null; color: string | null } }) {
  return (
    <div
      className={styles.teamRow}
      style={{
        borderColor: team.color || undefined,
        background: team.color ? `color-mix(in srgb, ${team.color} 8%, var(--card))` : undefined,
      }}
    >
      {team.logo && <img src={team.logo} alt="" className={styles.teamRowLogo} />}
      <span className={styles.teamRowName}>{team.name}</span>
    </div>
  );
}

function GifModal({
  title,
  gifs,
  selected,
  busy,
  onToggle,
  onUpload,
  onDelete,
  onClose,
}: {
  title: string;
  gifs: GifRow[];
  selected: string[];
  busy: boolean;
  onToggle: (url: string) => void;
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.uploadRow}>
          <button type="button" className={styles.secondaryBtn} disabled={busy} onClick={() => fileRef.current?.click()}>Upload GIF</button>
          <span className={styles.muted}>Tap a GIF to use it for this event.</span>
          <input ref={fileRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg,video/mp4" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ""; }} />
        </div>
        <div className={styles.modalList}>
          {gifs.length === 0 ? (
            <p className={styles.muted}>No GIFs yet. Upload a few.</p>
          ) : (
            <div className={styles.gifGrid}>
              {gifs.map((g) => {
                const on = selected.includes(g.url);
                return (
                  <button key={g.id} type="button" className={styles.gifTile} data-on={on || undefined} onClick={() => onToggle(g.url)}>
                    <img src={g.url} alt="" className={styles.gifTileImg} />
                    <span className={styles.gifTileCheck}>✓</span>
                    <span className={styles.gifTileDel} role="button" onClick={(e) => { e.stopPropagation(); onDelete(g.id); }}>×</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
