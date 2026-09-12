"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { stripMarkdown } from "@/lib/v2/text";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface Article {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
}

type Status = "draft" | "now" | "schedule";

/** Derive the editor's status control from a stored publish_at. */
function statusOf(publishAt: string | null): Status {
  if (!publishAt) return "draft";
  return new Date(publishAt).getTime() > Date.now() ? "schedule" : "now";
}

/** A short human label for a row's publish state (now = a captured timestamp). */
function stateLabel(publishAt: string | null, now: number): string {
  if (!publishAt) return "Draft";
  const t = new Date(publishAt);
  const scheduled = t.getTime() > now;
  const date = t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return scheduled ? `Scheduled ${date}` : `Published ${date}`;
}

/** ISO → value for a <input type="datetime-local"> in the viewer's local zone. */
function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function ArticleManager({ orgId }: { orgId: string; slug: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0); // captured once on mount (avoids impure Date.now() in render)
  const [editing, setEditing] = useState<Article | "new" | null>(null);

  // Editor fields.
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [focalX, setFocalX] = useState(50);
  const [focalY, setFocalY] = useState(50);
  const [status, setStatus] = useState<Status>("draft");
  const [scheduleAt, setScheduleAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchArticles = useCallback(async (): Promise<Article[]> => {
    const r = await fetch(`/api/v2/articles?orgId=${orgId}`);
    return r.ok ? (await r.json()).articles || [] : [];
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const a = await fetchArticles();
      if (active) {
        setNow(Date.now());
        setArticles(a);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchArticles]);

  function openNew() {
    setEditing("new");
    setTitle("");
    setContent("");
    setImageUrl(null);
    setFocalX(50);
    setFocalY(50);
    setStatus("draft");
    setScheduleAt(toLocalInput(null));
    setError(null);
  }

  function openEdit(a: Article) {
    setEditing(a);
    setTitle(a.title);
    setContent(a.content || "");
    setImageUrl(a.image_url);
    setFocalX(a.image_focal_x ?? 50);
    setFocalY(a.image_focal_y ?? 50);
    setStatus(statusOf(a.publish_at));
    setScheduleAt(toLocalInput(a.publish_at));
    setError(null);
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("orgId", orgId);
    const res = await fetch("/api/v2/articles/upload-image", { method: "POST", body: form });
    setUploading(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not upload image");
      return;
    }
    setImageUrl(data.image_url);
    setFocalX(50);
    setFocalY(50);
  }

  /** Click on the hero preview to set the focal point (what stays visible on crop). */
  function setFocalFromClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setFocalX(Math.round(((e.clientX - rect.left) / rect.width) * 100));
    setFocalY(Math.round(((e.clientY - rect.top) / rect.height) * 100));
  }

  function computePublishAt(): string | null {
    if (status === "draft") return null;
    if (status === "now") return new Date().toISOString();
    // schedule
    return scheduleAt ? new Date(scheduleAt).toISOString() : null;
  }

  async function save() {
    if (busy) return;
    if (!title.trim()) {
      setError("A title is required.");
      return;
    }
    if (status === "schedule" && !scheduleAt) {
      setError("Pick a date and time to schedule.");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      orgId,
      title: title.trim(),
      content,
      image_url: imageUrl,
      image_focal_x: focalX,
      image_focal_y: focalY,
      publish_at: computePublishAt(),
    };
    const isNew = editing === "new";
    const res = await fetch(isNew ? "/api/v2/articles" : `/api/v2/articles/${(editing as Article).id}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not save the article");
      return;
    }
    setEditing(null);
    setArticles(await fetchArticles());
  }

  async function del() {
    if (editing === "new" || !editing) return;
    const res = await fetch(`/api/v2/articles/${editing.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not delete");
      return;
    }
    setEditing(null);
    setArticles(await fetchArticles());
  }

  // ── Editor view ───────────────────────────────────────────────────────────
  if (editing) {
    return (
      <>
        <button type="button" className={styles.back} onClick={() => setEditing(null)}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
          </svg>
          All articles
        </button>
        <h1 className={styles.title}>{editing === "new" ? "New article" : "Edit article"}</h1>

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className={styles.field}>
            <label className={styles.label}>Title</label>
            <input
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Article headline"
              autoFocus
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Hero image</label>
            {imageUrl ? (
              <>
                <div
                  onClick={setFocalFromClick}
                  style={{
                    position: "relative",
                    width: "100%",
                    aspectRatio: "16 / 9",
                    borderRadius: 12,
                    overflow: "hidden",
                    cursor: "crosshair",
                    border: "1px solid var(--line)",
                  }}
                >
                  <img
                    src={imageUrl}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      objectPosition: `${focalX}% ${focalY}%`,
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      left: `${focalX}%`,
                      top: `${focalY}%`,
                      width: 16,
                      height: 16,
                      transform: "translate(-50%, -50%)",
                      borderRadius: "50%",
                      border: "2px solid #fff",
                      boxShadow: "0 0 0 2px rgba(0,0,0,0.35)",
                      pointerEvents: "none",
                    }}
                  />
                </div>
                <p className={styles.swatchHint}>Tap the image to set the focal point (what stays in frame when cropped).</p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="button" className={styles.createBtnGhost} onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? "Uploading…" : "Replace image"}
                  </button>
                  <button type="button" className={styles.removeBtn} onClick={() => setImageUrl(null)}>
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className={styles.createBtnGhost} onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading…" : "Upload image"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              Content <span className={styles.optional}>(Markdown)</span>
            </label>
            <textarea
              className={styles.textarea}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={14}
              placeholder="Write your article… **bold**, _italic_, # headings, [links](https://…), and lists all work."
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Visibility</label>
            <div className={styles.segmented} style={{ alignSelf: "flex-start" }}>
              {(["draft", "now", "schedule"] as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.segmentBtn}
                  data-on={status === s ? "" : undefined}
                  onClick={() => setStatus(s)}
                >
                  {s === "draft" ? "Draft" : s === "now" ? "Publish now" : "Schedule"}
                </button>
              ))}
            </div>
            {status === "schedule" && (
              <input
                className={styles.input}
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                style={{ marginTop: 10 }}
              />
            )}
            <p className={styles.swatchHint}>
              {status === "draft"
                ? "Only editors can see this — members won't."
                : status === "now"
                  ? "Publishes immediately and appears on the home page and Articles list."
                  : "Stays hidden until the scheduled time, then appears automatically."}
            </p>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div className={styles.memberEditActions}>
            <button type="submit" className={styles.createBtn} disabled={busy}>
              {busy ? "Saving…" : editing === "new" ? "Create article" : "Save changes"}
            </button>
            {editing !== "new" && (
              <button type="button" className={styles.removeBtn} onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </form>

        <ConfirmModal
          open={confirmDelete}
          title="Delete article?"
          message={`Delete “${title || "this article"}”? This can't be undone.`}
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

  // ── List view ─────────────────────────────────────────────────────────────
  return (
    <>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Articles</h1>
        <button type="button" className={styles.circleAdd} aria-label="New article" onClick={openNew}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>All articles ({articles.length})</p>
        {loading ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>Loading…</p>
        ) : articles.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>
            No articles yet. Tap + above to write one.
          </p>
        ) : (
          <ul className={styles.memberList}>
            {articles.map((a) => {
              const preview = stripMarkdown(a.content || "", 90);
              return (
                <li key={a.id} className={styles.memberRow} style={{ padding: 0, border: "none" }}>
                  <button type="button" className={styles.memberRowBtn} onClick={() => openEdit(a)}>
                    {a.image_url ? (
                      <img
                        src={a.image_url}
                        alt=""
                        className={styles.memberAvatar}
                        style={{ objectPosition: `${a.image_focal_x ?? 50}% ${a.image_focal_y ?? 50}%` }}
                      />
                    ) : (
                      <span className={styles.memberAvatar}>{(a.title[0] || "?").toUpperCase()}</span>
                    )}
                    <div className={styles.memberMeta}>
                      <span className={styles.memberName}>{a.title || "Untitled"}</span>
                      <span className={styles.memberSub}>
                        {stateLabel(a.publish_at, now)}
                        {preview ? ` — ${preview}` : ""}
                      </span>
                    </div>
                    <span className={styles.roleBadge}>
                      {a.publish_at ? (new Date(a.publish_at).getTime() > now ? "scheduled" : "live") : "draft"}
                    </span>
                    <svg className={styles.arrow} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
