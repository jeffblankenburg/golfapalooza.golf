"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { evictSound } from "@/lib/v2/soundboard-audio";
import type { Sound, SoundboardTag } from "@/lib/v2/soundboard-types";
import { useSoundboard } from "./SoundboardProvider";
import SoundboardEditor from "./SoundboardEditor";
import styles from "./soundboard.module.css";
/* eslint-disable @next/next/no-img-element */

const TOP_TAG = "__top";

export default function SoundboardDrawer() {
  const sb = useSoundboard();
  const { isOpen, close, data, setData, loading, reload, blastOn, setBlastOn, playLocal, orgId } = sb;

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<Sound | null>(null);
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Sound | null>(null);
  const [showStats, setShowStats] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const sounds = data?.sounds ?? [];
  const tags = data?.tags ?? [];
  const myTop = data?.myTop ?? [];

  const filtered = useMemo(() => {
    const all = data?.sounds ?? [];
    const top = data?.myTop ?? [];
    let list = all;
    if (activeTag === TOP_TAG) {
      const rank = new Map(top.map((id, i) => [id, i]));
      list = all.filter((s) => rank.has(s.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    } else if (activeTag) {
      list = all.filter((s) => s.tag_ids.includes(activeTag));
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((s) => s.name.toLowerCase().includes(q));
    return list;
  }, [data, activeTag, query]);

  const canReorder = editMode && !activeTag && !query.trim();

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id || !data) return;
    const ids = data.sounds.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(data.sounds, from, to).map((s, i) => ({ ...s, sort_order: i }));
    setData({ ...data, sounds: reordered });
    await fetch("/api/v2/soundboard", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, order: reordered.map((s) => ({ id: s.id, sort_order: s.sort_order })) }),
    }).catch(() => {});
  }

  async function doDelete() {
    const s = toDelete;
    setToDelete(null);
    if (!s || !data) return;
    setData({ ...data, sounds: data.sounds.filter((x) => x.id !== s.id) });
    evictSound(s.audio_url);
    await fetch(`/api/v2/soundboard/${s.id}`, { method: "DELETE" }).catch(() => {});
  }

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={close} aria-hidden />
      <section className={styles.panel} role="dialog" aria-label="Soundboard">
        <header className={styles.head}>
          <span className={styles.title}>Soundboard</span>
          <div className={styles.headActions}>
            <button
              type="button"
              className={styles.blastToggle}
              data-on={blastOn || undefined}
              onClick={() => setBlastOn(!blastOn)}
              aria-pressed={blastOn}
            >
              <span className={styles.blastDot} />
              {blastOn ? "Blasting group" : "Blast to group"}
            </button>
            <button
              type="button"
              className={styles.headIconBtn}
              data-on={showStats || undefined}
              onClick={() => setShowStats((v) => !v)}
              aria-label="Stats"
              aria-pressed={showStats}
              title="Stats"
            >
              <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
              </svg>
            </button>
            <button type="button" className={styles.closeBtn} onClick={close} aria-label="Close">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className={styles.toolbar}>
          <input
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sounds"
          />
          <button
            type="button"
            className={styles.toolBtn}
            data-on={editMode || undefined}
            onClick={() => {
              setShowStats(false); // Edit always drops you onto the board.
              setEditMode((v) => !v);
            }}
          >
            {editMode ? "Done" : "Edit"}
          </button>
          <button type="button" className={styles.addBtn} onClick={() => setAdding(true)}>
            + Add
          </button>
        </div>

        {!showStats && (
          <div className={styles.chips}>
            <button
              type="button"
              className={styles.chip}
              data-on={activeTag === null || undefined}
              onClick={() => setActiveTag(null)}
            >
              All
            </button>
            {myTop.length > 0 && (
              <button
                type="button"
                className={styles.chip}
                data-on={activeTag === TOP_TAG || undefined}
                onClick={() => setActiveTag(TOP_TAG)}
              >
                ★ My most played
              </button>
            )}
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={styles.chip}
                data-on={activeTag === t.id || undefined}
                onClick={() => setActiveTag(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        <div className={styles.body}>
          {loading && !data ? (
            <p className={styles.empty}>Loading sounds…</p>
          ) : showStats ? (
            <StatsView orgId={orgId} sounds={sounds} />
          ) : filtered.length === 0 ? (
            <p className={styles.empty}>
              {sounds.length === 0 ? "No sounds yet. Add your first clip." : "Nothing matches."}
            </p>
          ) : canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={filtered.map((s) => s.id)} strategy={rectSortingStrategy}>
                <div className={styles.grid}>
                  {filtered.map((s) => (
                    <SortableTile
                      key={s.id}
                      sound={s}
                      onEdit={() => setEditing(s)}
                      onDelete={() => setToDelete(s)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div className={styles.grid}>
              {filtered.map((s) => (
                <Tile
                  key={s.id}
                  sound={s}
                  editMode={editMode}
                  onPlay={() => playLocal(s)}
                  onEdit={() => setEditing(s)}
                  onDelete={() => setToDelete(s)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {(adding || editing) && (
        <SoundboardEditor
          orgId={orgId}
          sound={editing}
          tags={tags}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => void reload()}
          onTagCreated={(t: SoundboardTag) =>
            setData((d) => (d ? { ...d, tags: [...d.tags, t] } : d))
          }
        />
      )}

      <ConfirmModal
        open={!!toDelete}
        title="Delete this sound?"
        message={toDelete ? `"${toDelete.name}" and its play history will be removed. This can't be undone.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void doDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

function TileInner({ sound, big }: { sound: Sound; big?: boolean }) {
  return (
    <>
      <span className={styles.tileIcon}>
        {sound.image_url ? (
          <img src={sound.image_url} alt="" className={styles.tileImg} />
        ) : (
          <span className={big ? styles.tileEmojiBig : styles.tileEmoji}>{sound.emoji || "🔊"}</span>
        )}
      </span>
      <span className={styles.tileName}>{sound.name}</span>
      {sound.play_count > 0 && <span className={styles.tilePlays}>{sound.play_count}</span>}
    </>
  );
}

function Tile({
  sound,
  editMode,
  onPlay,
  onEdit,
  onDelete,
}: {
  sound: Sound;
  editMode: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (editMode) {
    return (
      <div className={styles.tile} data-edit>
        <button type="button" className={styles.tileFace} onClick={onEdit} aria-label={`Edit ${sound.name}`}>
          <TileInner sound={sound} />
        </button>
        <button type="button" className={styles.tileDelete} onClick={onDelete} aria-label={`Delete ${sound.name}`}>
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }
  return (
    <button type="button" className={styles.tile} onClick={onPlay} aria-label={`Play ${sound.name}`}>
      <TileInner sound={sound} />
    </button>
  );
}

function SortableTile({
  sound,
  onEdit,
  onDelete,
}: {
  sound: Sound;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sound.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={styles.tile} data-edit {...attributes} {...listeners}>
      <button type="button" className={styles.tileFace} onClick={onEdit} aria-label={`Edit ${sound.name}`}>
        <TileInner sound={sound} />
      </button>
      <button
        type="button"
        className={styles.tileDelete}
        onClick={onDelete}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Delete ${sound.name}`}
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

interface TopBlaster {
  sound_id: string;
  name: string;
  play_count: number;
}

function StatsView({ orgId, sounds }: { orgId: string; sounds: Sound[] }) {
  const [top, setTop] = useState<Map<string, TopBlaster> | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/v2/soundboard/stats?orgId=${orgId}`);
      if (!active) return;
      if (res.ok) {
        const body = (await res.json()) as { topBlasters: TopBlaster[] };
        setTop(new Map(body.topBlasters.map((t) => [t.sound_id, t])));
      } else {
        setTop(new Map());
      }
    })();
    return () => {
      active = false;
    };
  }, [orgId]);

  const ranked = [...sounds].sort((a, b) => b.play_count - a.play_count).filter((s) => s.play_count > 0);

  if (!top) return <p className={styles.empty}>Loading stats…</p>;
  if (ranked.length === 0) return <p className={styles.empty}>No plays yet. Blast something.</p>;

  return (
    <div className={styles.stats}>
      <div className={styles.statsHeadRow}>
        <span>Sound</span>
        <span>Plays</span>
        <span>Top blaster</span>
      </div>
      {ranked.map((s) => {
        const tb = top.get(s.id);
        return (
          <div key={s.id} className={styles.statsRow}>
            <span className={styles.statsName}>
              <span className={styles.statsIcon}>{s.image_url ? "🖼️" : s.emoji || "🔊"}</span>
              {s.name}
            </span>
            <span className={styles.statsPlays}>{s.play_count}</span>
            <span className={styles.statsBlaster}>{tb ? `${tb.name} (${tb.play_count})` : "nobody yet"}</span>
          </div>
        );
      })}
    </div>
  );
}
