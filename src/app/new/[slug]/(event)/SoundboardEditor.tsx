"use client";

import { useRef, useState } from "react";
import { EmojiPicker } from "@/components/chat/EmojiPicker";
import { evictSound } from "@/lib/v2/soundboard-audio";
import type { Sound, SoundboardTag } from "@/lib/v2/soundboard-types";
import styles from "./soundboard.module.css";
/* eslint-disable @next/next/no-img-element */

function audioExtFor(file: File): string {
  const t = file.type;
  if (t.includes("wav")) return "wav";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("webm")) return "webm";
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "m4a";
  return "mp3";
}

async function putSigned(signedUrl: string, body: Blob, contentType: string) {
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Cache-Control": "max-age=31536000" },
    body,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

/**
 * Resize an icon to fit `maxDim` and encode as PNG — preserving transparency and
 * avoiding the JPEG artifacts that wreck sharp-edged art (logos, pixel art, coins).
 * Icons display small, so a modest max keeps them crisp without bloating the file.
 */
async function toIconPng(file: File, maxDim = 192): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read that image"));
      el.src = url;
    });
    let { width, height } = img;
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Signed = { signedUrl: string; token: string; path: string; publicUrl: string };

/**
 * Add / edit one sound. Audio is uploaded via a signed URL (direct to storage).
 * On edit, audio isn't replaced (delete + re-add for that); name, emoji, icon
 * image, and tags are editable. Tags can be created inline so the vocabulary
 * grows without leaving the flow.
 */
export default function SoundboardEditor({
  orgId,
  sound,
  tags,
  onClose,
  onSaved,
  onTagCreated,
}: {
  orgId: string;
  sound: Sound | null;
  tags: SoundboardTag[];
  onClose: () => void;
  onSaved: () => void;
  onTagCreated: (tag: SoundboardTag) => void;
}) {
  const editing = !!sound;
  const [name, setName] = useState(sound?.name ?? "");
  const [emoji, setEmoji] = useState(sound?.emoji ?? "");
  const [showEmoji, setShowEmoji] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(sound?.image_url ?? null);
  const [imageTouched, setImageTouched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(sound?.tag_ids ?? []));
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);

  function toggleTag(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function addTag() {
    const nm = newTag.trim();
    if (!nm) return;
    const res = await fetch("/api/v2/soundboard/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, name: nm }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Could not add tag");
      return;
    }
    onTagCreated(body.tag as SoundboardTag);
    setSelected((s) => new Set(s).add(body.tag.id));
    setNewTag("");
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setImageTouched(true);
    setImagePreview(f ? URL.createObjectURL(f) : null);
  }

  async function save() {
    const audioFile = audioRef.current?.files?.[0];
    if (!name.trim()) {
      setError("Give it a name");
      return;
    }
    if (!editing && !audioFile) {
      setError("Pick an audio clip");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const imageFile = imageRef.current?.files?.[0];
      const imageBlob = imageFile ? await toIconPng(imageFile, 192) : null;

      // Signed URLs for whatever we're uploading.
      let audio: Signed | null = null;
      let image: Signed | null = null;
      const needAudio = !!audioFile;
      const needImage = !!imageBlob;
      if (needAudio || needImage) {
        const urlRes = await fetch("/api/v2/soundboard/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId,
            hasAudio: needAudio,
            audioExt: audioFile ? audioExtFor(audioFile) : undefined,
            hasImage: needImage,
          }),
        });
        const urls = await urlRes.json().catch(() => ({}));
        if (!urlRes.ok) throw new Error(urls.error || "Could not start upload");
        audio = urls.audio;
        image = urls.image;
        if (audio && audioFile) await putSigned(audio.signedUrl, audioFile, audioFile.type || "audio/mpeg");
        if (image && imageBlob) await putSigned(image.signedUrl, imageBlob, "image/png");
      }

      const tagIds = [...selected];
      if (editing && sound) {
        const patch: Record<string, unknown> = { name: name.trim(), emoji, tagIds };
        if (image) {
          patch.image_url = image.publicUrl;
          patch.image_path = image.path;
        } else if (imageTouched && !imagePreview) {
          patch.image_url = null;
          patch.image_path = null;
        }
        const res = await fetch(`/api/v2/soundboard/${sound.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
        evictSound(sound.audio_url);
      } else {
        const res = await fetch("/api/v2/soundboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId,
            name: name.trim(),
            emoji,
            audio_url: audio?.publicUrl,
            audio_path: audio?.path,
            image_url: image?.publicUrl ?? null,
            image_path: image?.path ?? null,
            tagIds,
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>{editing ? "Edit sound" : "Add a sound"}</h2>
          <button type="button" className={styles.iconClose} onClick={onClose} aria-label="Close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={styles.modalBody}>
          {/* Icon: emoji + optional image */}
          <div className={styles.iconRow}>
            <button
              type="button"
              className={styles.emojiBtn}
              onClick={() => setShowEmoji((v) => !v)}
              aria-label="Choose emoji"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="" className={styles.iconImgPreview} />
              ) : emoji ? (
                <span className={styles.emojiGlyph}>{emoji}</span>
              ) : (
                <span className={styles.emojiPlaceholder}>🙂</span>
              )}
            </button>
            <div className={styles.iconActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => imageRef.current?.click()}>
                {imagePreview ? "Change image" : "Use an image"}
              </button>
              {imagePreview && (
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => {
                    setImagePreview(null);
                    setImageTouched(true);
                    if (imageRef.current) imageRef.current.value = "";
                  }}
                >
                  Remove image
                </button>
              )}
              <input ref={imageRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            </div>
          </div>

          {showEmoji && (
            <div className={styles.emojiPop}>
              <EmojiPicker
                onSelect={(e) => {
                  setEmoji(e);
                  setImagePreview(null);
                  setImageTouched(true);
                  if (imageRef.current) imageRef.current.value = "";
                  setShowEmoji(false);
                }}
              />
            </div>
          )}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Name</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Airhorn"
              maxLength={60}
            />
          </label>

          {!editing && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Audio clip</span>
              <input ref={audioRef} type="file" accept="audio/*" className={styles.fileInput} />
              <span className={styles.hint}>MP3, WAV, OGG or WEBM, up to 5 MB. Short clips play best.</span>
            </label>
          )}

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Tags</span>
            <div className={styles.tagWrap}>
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={styles.tagChip}
                  data-on={selected.has(t.id) || undefined}
                  onClick={() => toggleTag(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <div className={styles.newTagRow}>
              <input
                className={styles.input}
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="New tag"
                maxLength={30}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addTag();
                  }
                }}
              />
              <button type="button" className={styles.ghostBtn} onClick={() => void addTag()} disabled={!newTag.trim()}>
                Add tag
              </button>
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.modalActions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.saveBtn} onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
