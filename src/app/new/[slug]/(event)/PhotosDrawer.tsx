"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v2RealtimeClient } from "@/lib/v2/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { compressImage, compressVideo, extractVideoFrame } from "@/lib/v2/gallery-compress";
import { extractExifDate, extractVideoDate } from "@/lib/v2/gallery-exif";
import MediaViewer, { type ViewerItem, type ViewerUser } from "./MediaViewer";
import styles from "./photos.module.css";
/* eslint-disable @next/next/no-img-element */

interface Item {
  id: string;
  uploader_id: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: "photo" | "video";
  caption: string | null;
  width: number | null;
  height: number | null;
  taken_at: string | null;
  created_at: string;
  uploader: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;
  reactions: { emoji: string; user_id: string }[] | null;
  tags: { tagged_user_id: string }[] | null;
  comments: { count: number }[] | null;
}
type Sort = "taken" | "uploaded";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Transform a raw gallery row into the shape MediaViewer consumes. */
function toViewerItem(it: Item, userId: string): ViewerItem {
  const reactions: Record<string, { count: number; hasReacted: boolean }> = {};
  for (const r of it.reactions || []) {
    const e = reactions[r.emoji] || { count: 0, hasReacted: false };
    e.count += 1;
    if (r.user_id === userId) e.hasReacted = true;
    reactions[r.emoji] = e;
  }
  const up = one(it.uploader);
  return {
    id: it.id,
    media_url: it.media_url,
    thumbnail_url: it.thumbnail_url,
    media_type: it.media_type,
    caption: it.caption,
    width: it.width,
    height: it.height,
    created_at: it.created_at,
    taken_at: it.taken_at,
    uploader_id: it.uploader_id,
    uploader: { display_name: up?.display_name || "Member", avatar_url: up?.avatar_url ?? null },
    reactions,
    reactionCount: Object.values(reactions).reduce((s, r) => s + r.count, 0),
    tags: (it.tags || []).map((t) => t.tagged_user_id),
    commentCount: it.comments?.[0]?.count ?? 0,
  };
}

/**
 * Photo gallery grid. Mirrors the legacy filters: sort toggle (Date Taken /
 * Date Uploaded), a year select, and a tagged-Loozer multi-select. Lazy
 * thumbnails, infinite scroll, realtime new items.
 */
export default function PhotosDrawer({
  orgId,
  userId,
  isAdmin,
}: {
  orgId: string;
  userId: string;
  isAdmin: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<ViewerUser[]>([]);

  // Filters (mirror the original).
  const [sort, setSort] = useState<Sort>("taken");
  const [year, setYear] = useState<string>("all");
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set());
  const [showFilterUsers, setShowFilterUsers] = useState(false);
  const [years, setYears] = useState<number[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<{ userId: string; displayName: string }[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const taggedKey = [...taggedIds].sort().join(",");
  const filtersActive = year !== "all" || taggedIds.size > 0;

  const params = useCallback(
    (cur?: string) => {
      const p = new URLSearchParams({ orgId });
      if (sort === "uploaded") p.set("sort", "uploaded");
      if (year !== "all") p.set("year", year);
      if (taggedIds.size) p.set("taggedUserIds", [...taggedIds].join(","));
      if (cur) p.set("cursor", cur);
      return p.toString();
    },
    [orgId, sort, year, taggedIds],
  );

  // Filter options.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/gallery/facets?orgId=${orgId}`);
        const d = res.ok ? await res.json() : { years: [], taggedUsers: [] };
        if (cancelled) return;
        setYears(d.years || []);
        setTaggedUsers(d.taggedUsers || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  // Members (for the viewer's tag picker + tag-name resolution).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v2/chat/members?orgId=${orgId}&includeSelf=1`);
      const d = res.ok ? await res.json() : { members: [] };
      if (cancelled) return;
      setAllUsers(
        (d.members || []).map((m: { userId: string; displayName: string; avatarUrl: string | null }) => ({
          id: m.userId,
          display_name: m.displayName,
          avatar_url: m.avatarUrl,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const viewerItems = useMemo(() => items.map((it) => toViewerItem(it, userId)), [items, userId]);

  // Load / reload on filter change.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const res = await fetch(`/api/v2/gallery?${params()}`);
        const d = res.ok ? await res.json() : { items: [], nextCursor: null };
        if (cancelled) return;
        setItems(d.items || []);
        setCursor(d.nextCursor);
        setHasMore(!!d.nextCursor);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, sort, year, taggedKey, reloadKey]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || !cursor) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/gallery?${params(cursor)}`);
      const d = res.ok ? await res.json() : { items: [], nextCursor: null };
      setItems((cur) => {
        const seen = new Set(cur.map((i) => i.id));
        return [...cur, ...(d.items || []).filter((i: Item) => !seen.has(i.id))];
      });
      setCursor(d.nextCursor);
      setHasMore(!!d.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [params, cursor, hasMore, loading]);

  // Realtime: prepend new items only when no filters narrow the view.
  useEffect(() => {
    let cancelled = false;
    let sb: Awaited<ReturnType<typeof v2RealtimeClient>> | null = null;
    let channel: RealtimeChannel | null = null;
    (async () => {
      sb = await v2RealtimeClient();
      if (cancelled) return;
      channel = sb
        .channel(`v2-gallery-${orgId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "v2_gallery_items", filter: `org_id=eq.${orgId}` },
          (payload) => {
            if (filtersActive) return;
            const it = payload.new as Item;
            setItems((cur) => (cur.some((x) => x.id === it.id) ? cur : [it, ...cur]));
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [orgId, filtersActive]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) loadMore();
  }

  // Upload one file: compress (photo/video), extract date + video thumbnail,
  // signed direct-to-storage upload, then record the item.
  async function uploadOne(file: File, bulkId: string): Promise<{ thumb: string | null } | null> {
    const isVideo = file.type.startsWith("video/");
    let blob: Blob;
    let width: number | null = null;
    let height: number | null = null;
    let thumbBlob: Blob | null = null;
    let takenAt: string | null = null;
    try {
      if (isVideo) {
        takenAt = (await extractVideoDate(file))?.toISOString() ?? null;
        try {
          const c = await compressVideo(file);
          blob = c.blob;
          width = c.width;
          height = c.height;
        } catch {
          blob = file;
        }
        try {
          thumbBlob = await extractVideoFrame(file);
        } catch {
          thumbBlob = null;
        }
      } else {
        takenAt = (await extractExifDate(file))?.toISOString() ?? null;
        const c = await compressImage(file, 1280, 0.8);
        blob = c.blob;
        width = c.width;
        height = c.height;
      }

      const urlRes = await fetch("/api/v2/gallery/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, mediaType: isVideo ? "video" : "photo", fileName: file.name }),
      });
      if (!urlRes.ok) throw new Error();
      const u = await urlRes.json();

      const put = await fetch(u.signedUrl, {
        method: "PUT",
        body: blob,
        headers: { "content-type": blob.type || (isVideo ? "video/mp4" : "image/jpeg") },
      });
      if (!put.ok) throw new Error();

      let thumbnailUrl: string | null = null;
      if (isVideo && thumbBlob && u.thumbSignedUrl) {
        await fetch(u.thumbSignedUrl, { method: "PUT", body: thumbBlob, headers: { "content-type": "image/jpeg" } });
        thumbnailUrl = u.thumbPublicUrl;
      }

      await fetch("/api/v2/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          mediaUrl: u.publicUrl,
          thumbnailUrl,
          mediaType: isVideo ? "video" : "photo",
          takenAt,
          width,
          height,
          bulkId,
        }),
      });
      return { thumb: thumbnailUrl || u.publicUrl };
    } catch {
      return null;
    }
  }

  async function handleFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const bulkId = crypto.randomUUID();
    setUpload({ done: 0, total: files.length });
    let firstThumb: string | null = null;
    let done = 0;
    const queue = [...files];
    const worker = async () => {
      while (queue.length) {
        const f = queue.shift()!;
        const r = await uploadOne(f, bulkId);
        if (r && !firstThumb) firstThumb = r.thumb;
        done += 1;
        setUpload({ done, total: files.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await fetch("/api/v2/gallery/log-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, count: files.length, imageUrl: firstThumb }),
    }).catch(() => {});
    setUpload(null);
    setReloadKey((k) => k + 1);
  }

  function toggleTagged(id: string) {
    setTaggedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.filters}>
        <button
          type="button"
          className={styles.sortBtn}
          onClick={() => setSort((s) => (s === "taken" ? "uploaded" : "taken"))}
        >
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          {sort === "taken" ? "Date Taken" : "Date Uploaded"}
        </button>

        {years.length > 0 && (
          <select
            className={styles.yearSelect}
            data-on={year !== "all" || undefined}
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        )}

        {taggedUsers.length > 0 && (
          <button
            type="button"
            className={styles.loozerBtn}
            data-on={taggedIds.size > 0 || undefined}
            onClick={() => setShowFilterUsers((v) => !v)}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {taggedIds.size > 0 ? taggedIds.size : "Loozers"}
          </button>
        )}

        {showFilterUsers && taggedIds.size > 0 && (
          <button type="button" className={styles.clearBtn} onClick={() => setTaggedIds(new Set())}>
            Clear
          </button>
        )}
      </div>

      {showFilterUsers && taggedUsers.length > 0 && (
        <div className={styles.loozerPanel}>
          <div className={styles.loozerHead}>
            <span className={styles.loozerTitle}>Filter by Loozer</span>
            <button type="button" className={styles.loozerDone} onClick={() => setShowFilterUsers(false)}>
              Done
            </button>
          </div>
          <div className={styles.loozerPicker}>
            {taggedUsers.map((u) => (
              <button
                key={u.userId}
                type="button"
                className={styles.loozerChip}
                data-on={taggedIds.has(u.userId) || undefined}
                onClick={() => toggleTagged(u.userId)}
              >
                {u.displayName}
              </button>
            ))}
          </div>
        </div>
      )}

      {ready && items.length === 0 ? (
        <p className={styles.empty}>No photos match.</p>
      ) : (
        <div className={styles.scrollArea} onScroll={onScroll}>
          <div className={styles.grid}>
            {items.map((it, i) => (
              <button key={it.id} type="button" className={styles.cell} onClick={() => setViewIndex(i)}>
                <img src={it.thumbnail_url || it.media_url} alt="" loading="lazy" />
                {it.media_type === "video" && (
                  <span className={styles.playBadge} aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add photos (single or bulk). */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className={styles.addFab}
        onClick={() => fileRef.current?.click()}
        disabled={!!upload}
        aria-label="Add photos"
      >
        <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {upload && (
        <div className={styles.uploadToast}>
          <span className={styles.uploadSpinner} />
          Uploading {upload.done}/{upload.total}…
        </div>
      )}

      {viewIndex !== null && (
        <MediaViewer
          items={viewerItems}
          initialIndex={viewIndex}
          orgId={orgId}
          userId={userId}
          isAdmin={isAdmin}
          allUsers={allUsers}
          onClose={() => setViewIndex(null)}
          onDelete={(id) => setItems((cur) => cur.filter((it) => it.id !== id))}
        />
      )}
    </div>
  );
}
