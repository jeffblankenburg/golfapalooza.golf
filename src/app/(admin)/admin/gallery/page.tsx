"use client";

import { useState, useEffect, useCallback } from "react";
import { compressImage, compressVideo, getExtFromMime } from "@/lib/gallery/compress";

interface GalleryItem {
  id: string;
  media_url: string;
  thumbnail_url: string | null;
  media_type: "photo" | "video";
  caption: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
  taken_at: string | null;
  sort_date: string;
  uploader: { display_name: string } | null;
}

type ItemStatus = "pending" | "compressing" | "uploading" | "done" | "error";
type Tab = "photos" | "videos";

const IMAGE_MAX_DIM = 1280;
const IMAGE_QUALITY = 0.8;

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toLocalDateInput(dateStr: string) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── Inline date editor ──────────────────────────────────────────────────────

function DateEditor({
  item,
  onSave,
}: {
  item: GalleryItem;
  onSave: (itemId: string, takenAt: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    item.taken_at ? toLocalDateInput(item.taken_at) : ""
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const takenAt = value ? new Date(value + "T12:00:00").toISOString() : null;
    try {
      const res = await fetch(`/api/gallery/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taken_at: takenAt }),
      });
      if (res.ok) {
        onSave(item.id, takenAt);
        setEditing(false);
      }
    } catch (err) {
      console.error("Failed to update taken_at:", err);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <input
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          className="text-xs border border-gray-300 rounded px-1.5 py-0.5 w-32"
        />
        <button
          onClick={save}
          disabled={saving}
          className="text-xs text-green-600 font-semibold disabled:opacity-50"
        >
          {saving ? "..." : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs text-gray-400"
        >
          Cancel
        </button>
        {item.taken_at && (
          <button
            onClick={() => {
              setValue("");
              // Save immediately with null
              setSaving(true);
              fetch(`/api/gallery/${item.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ taken_at: null }),
              })
                .then((res) => {
                  if (res.ok) {
                    onSave(item.id, null);
                    setEditing(false);
                  }
                })
                .finally(() => setSaving(false));
            }}
            className="text-xs text-red-500 font-semibold"
          >
            Clear
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs mt-0.5 text-left"
    >
      {item.taken_at ? (
        <span className="text-gray-600 inline-flex items-center gap-1">
          Taken {formatDate(item.taken_at)}
          <svg className="w-3 h-3 text-gray-400 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </span>
      ) : (
        <span className="text-orange-500">No date taken — set one</span>
      )}
    </button>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AdminGalleryPage() {
  const [tab, setTab] = useState<Tab>("photos");
  const [photos, setPhotos] = useState<GalleryItem[]>([]);
  const [videos, setVideos] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [progressPct, setProgressPct] = useState<number | null>(null);
  const [itemStatuses, setItemStatuses] = useState<Record<string, ItemStatus>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [photoRes, videoRes] = await Promise.all([
        fetch("/api/gallery?media_type=photo&limit=500"),
        fetch("/api/gallery?media_type=video&limit=500"),
      ]);
      const [photoData, videoData] = await Promise.all([photoRes.json(), videoRes.json()]);
      setPhotos(photoData.items || []);
      setVideos(videoData.items || []);
    } catch (err) {
      console.error("Failed to fetch gallery items:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleDateSave = (itemId: string, takenAt: string | null) => {
    const updater = (items: GalleryItem[]) =>
      items.map((i) => (i.id === itemId ? { ...i, taken_at: takenAt } : i));
    setPhotos(updater);
    setVideos(updater);
  };

  // Photos needing reprocess: width > 1280 (uploaded at old 1920px setting)
  const oversizedPhotos = photos.filter((p) => p.width != null && p.width > IMAGE_MAX_DIM);
  const uncompressedVideos = videos.filter((v) => v.width === null);

  const reprocessPhotos = async () => {
    const toProcess = oversizedPhotos;
    if (toProcess.length === 0) return;

    setProcessing(true);
    setTotalToProcess(toProcess.length);
    setCurrentIndex(0);

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      setCurrentIndex(i + 1);
      setProgressPct(null);
      setItemStatuses((prev) => ({ ...prev, [item.id]: "compressing" }));

      try {
        const response = await fetch(item.media_url);
        if (!response.ok) throw new Error(`Failed to download image (${response.status})`);
        const blob = await response.blob();
        const file = new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" });

        const compressed = await compressImage(file, IMAGE_MAX_DIM, IMAGE_QUALITY);

        setItemStatuses((prev) => ({ ...prev, [item.id]: "uploading" }));

        const formData = new FormData();
        formData.set("itemId", item.id);
        formData.set("file", compressed.blob, "photo.jpg");
        formData.set("width", String(compressed.width));
        formData.set("height", String(compressed.height));

        const uploadRes = await fetch("/api/admin/gallery/reprocess", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || "Upload failed");
        }

        setItemStatuses((prev) => ({ ...prev, [item.id]: "done" }));
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === item.id
              ? { ...p, width: compressed.width, height: compressed.height }
              : p
          )
        );
      } catch (err) {
        console.error(`Failed to reprocess photo ${item.id}:`, err);
        setItemStatuses((prev) => ({ ...prev, [item.id]: "error" }));
        setItemErrors((prev) => ({
          ...prev,
          [item.id]: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    }

    setProcessing(false);
    setProgressPct(null);
  };

  const reprocessVideos = async () => {
    const toProcess = uncompressedVideos;
    if (toProcess.length === 0) return;

    setProcessing(true);
    setTotalToProcess(toProcess.length);
    setCurrentIndex(0);

    for (let i = 0; i < toProcess.length; i++) {
      const item = toProcess[i];
      setCurrentIndex(i + 1);
      setProgressPct(0);
      setItemStatuses((prev) => ({ ...prev, [item.id]: "compressing" }));

      try {
        const response = await fetch(item.media_url);
        if (!response.ok) throw new Error(`Failed to download video (${response.status})`);
        const blob = await response.blob();
        const file = new File([blob], "video.mp4", { type: blob.type || "video/mp4" });

        const compressed = await compressVideo(file, {
          maxHeight: 720,
          bitrate: 2_500_000,
          onProgress: (pct) => setProgressPct(Math.round(pct)),
        });

        setItemStatuses((prev) => ({ ...prev, [item.id]: "uploading" }));
        setProgressPct(null);

        const formData = new FormData();
        formData.set("itemId", item.id);
        formData.set("file", compressed.blob, `video.${getExtFromMime(compressed.blob.type)}`);
        formData.set("width", String(compressed.width));
        formData.set("height", String(compressed.height));

        const uploadRes = await fetch("/api/admin/gallery/reprocess", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.error || "Upload failed");
        }

        setItemStatuses((prev) => ({ ...prev, [item.id]: "done" }));
        setVideos((prev) =>
          prev.map((v) =>
            v.id === item.id
              ? { ...v, width: compressed.width, height: compressed.height }
              : v
          )
        );
      } catch (err) {
        console.error(`Failed to reprocess video ${item.id}:`, err);
        setItemStatuses((prev) => ({ ...prev, [item.id]: "error" }));
        setItemErrors((prev) => ({
          ...prev,
          [item.id]: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    }

    setProcessing(false);
    setProgressPct(null);
  };

  const doneCount = Object.values(itemStatuses).filter((s) => s === "done").length;
  const currentItems = tab === "photos" ? photos : videos;
  const needsReprocess = tab === "photos" ? oversizedPhotos : uncompressedVideos;
  const reprocessFn = tab === "photos" ? reprocessPhotos : reprocessVideos;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Gallery Media</h1>
      <p className="text-sm text-gray-500 mb-4">
        Reprocess media for faster loading.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {(["photos", "videos"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => !processing && setTab(t)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === t
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500"
            }`}
          >
            {t === "photos" ? `Photos (${photos.length})` : `Videos (${videos.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500">
          <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{currentItems.length}</div>
                <div className="text-xs text-gray-500">
                  Total {tab === "photos" ? "Photos" : "Videos"}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {needsReprocess.length}
                </div>
                <div className="text-xs text-gray-500">
                  {tab === "photos" ? `Over ${IMAGE_MAX_DIM}px` : "Uncompressed"}
                </div>
              </div>
            </div>
          </div>

          {/* Reprocess button */}
          {needsReprocess.length > 0 && (
            <button
              onClick={reprocessFn}
              disabled={processing}
              className="w-full py-3 mb-6 bg-green-600 text-white font-semibold rounded-xl disabled:opacity-50 active:scale-95 transition-transform"
            >
              {processing
                ? `Processing ${currentIndex} of ${totalToProcess}...`
                : `Reprocess ${tab === "photos" ? "Oversized" : "Uncompressed"} (${needsReprocess.length})`}
            </button>
          )}

          {/* Progress */}
          {processing && (
            <div className="mb-6">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>
                  {progressPct != null ? "Compressing..." : "Uploading..."}
                </span>
                <span className="font-medium">
                  {doneCount} / {totalToProcess} done
                </span>
              </div>
              {progressPct != null && (
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 rounded-full transition-all duration-200"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Item list */}
          <div className="space-y-3">
            {currentItems.map((item) => {
              const status = itemStatuses[item.id];
              const errMsg = itemErrors[item.id];
              const thumbSrc = item.thumbnail_url || (item.media_type === "photo" ? item.media_url : null);
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl"
                >
                  {/* Thumbnail */}
                  <div className="w-14 h-14 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                    {thumbSrc ? (
                      <img
                        src={thumbSrc}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {item.caption || "No caption"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.uploader?.display_name || "Unknown"} &middot;{" "}
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs mt-0.5">
                      {item.width && item.height ? (
                        <span
                          className={
                            (tab === "photos" && item.width > IMAGE_MAX_DIM)
                              ? "text-orange-600"
                              : "text-green-600"
                          }
                        >
                          {item.width}x{item.height}
                        </span>
                      ) : tab === "videos" ? (
                        <span className="text-orange-600">Uncompressed</span>
                      ) : (
                        <span className="text-gray-400">Unknown</span>
                      )}
                    </div>
                    <DateEditor item={item} onSave={handleDateSave} />
                    {errMsg && (
                      <div className="text-xs text-red-600 mt-0.5">{errMsg}</div>
                    )}
                  </div>

                  {/* Status indicator */}
                  <div className="flex-shrink-0 pt-1">
                    {status === "compressing" && (
                      <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    )}
                    {status === "uploading" && (
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    )}
                    {status === "done" && (
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {status === "error" && (
                      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {currentItems.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              No {tab === "photos" ? "photos" : "videos"} in the gallery yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
