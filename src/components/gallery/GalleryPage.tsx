"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";
import { MediaUploader } from "./MediaUploader";
import { MediaViewer } from "./MediaViewer";

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
  trip_id: string | null;
  uploader_id: string;
  uploader: { id: string; display_name: string; avatar_url: string | null };
  reactions: Record<string, { count: number; hasReacted: boolean }>;
  reactionCount: number;
  tags: string[];
  commentCount: number;
}

interface GalleryUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function GalleryPage({
  activeTripId,
  userId,
  userName,
  isAdmin,
  allUsers,
  taggedUsers,
  availableYears,
}: {
  activeTripId: string | null;
  userId: string;
  userName: string;
  isAdmin: boolean;
  allUsers: GalleryUser[];
  taggedUsers: GalleryUser[];
  availableYears: number[];
}) {
  const searchParams = useSearchParams();
  const { isVisible: musicPlayerVisible } = useMusicPlayer();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [deepLinkShowComments, setDeepLinkShowComments] = useState(false);
  const [sortBy, setSortBy] = useState<"taken" | "uploaded">("taken");
  const [filterUserIds, setFilterUserIds] = useState<Set<string>>(new Set());
  const [filterYear, setFilterYear] = useState<string>("all");
  const [showFilterUsers, setShowFilterUsers] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const justUploadedRef = useRef(false);
  const deepLinkHandled = useRef(false);

  const fetchItems = useCallback(
    async (cursor?: string): Promise<{ items: GalleryItem[]; hasMore: boolean }> => {
      const params = new URLSearchParams({ limit: "24" });
      if (sortBy === "uploaded") params.set("sort_by", "uploaded");
      if (filterUserIds.size > 0) params.set("tagged_user_ids", [...filterUserIds].join(","));
      if (filterYear !== "all") params.set("year", filterYear);
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/gallery?${params}`);
      if (!res.ok) {
        console.error("Gallery fetch failed:", res.status, await res.text().catch(() => ""));
        return { items: [], hasMore: false };
      }
      const data = await res.json();
      return {
        items: data.items || [],
        hasMore: data.hasMore ?? false,
      };
    },
    [sortBy, filterUserIds, filterYear]
  );

  // Initial load + re-fetch when filter changes
  useEffect(() => {
    setLoading(true);
    cursorRef.current = null;
    fetchItems().then((data) => {
      setItems(data.items);
      setHasMore(data.hasMore);
      if (data.items.length > 0) {
        cursorRef.current = sortBy === "uploaded" ? data.items[data.items.length - 1].created_at : data.items[data.items.length - 1].sort_date;
      }
      setLoading(false);
    }).catch(() => {
      setHasMore(false);
      setLoading(false);
    });
  }, [fetchItems]);

  // Deep link: open viewer to a specific item via ?item=<id>&comments=1
  useEffect(() => {
    if (deepLinkHandled.current || loading || items.length === 0) return;
    const itemId = searchParams.get("item");
    if (!itemId) return;

    const wantComments = searchParams.get("comments") === "1";
    if (wantComments) setDeepLinkShowComments(true);

    const index = items.findIndex((i) => i.id === itemId);
    if (index >= 0) {
      setViewerIndex(index);
      deepLinkHandled.current = true;
    } else {
      // Item not in current page — fetch it directly and prepend
      fetch(`/api/gallery/${itemId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.item) {
            setItems((prev) => [data.item, ...prev]);
            setViewerIndex(0);
          }
          deepLinkHandled.current = true;
        })
        .catch(() => {
          deepLinkHandled.current = true;
        });
    }
  }, [loading, items, searchParams]);

  // Infinite scroll
  useEffect(() => {
    if (!hasMore || loading) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && hasMore) {
          setLoadingMore(true);
          fetchItems(cursorRef.current || undefined).then((data) => {
            setItems((prev) => [...prev, ...data.items]);
            setHasMore(data.hasMore);
            if (data.items.length > 0) {
              cursorRef.current = sortBy === "uploaded" ? data.items[data.items.length - 1].created_at : data.items[data.items.length - 1].sort_date;
            }
            setLoadingMore(false);
          }).catch(() => {
            setHasMore(false);
            setLoadingMore(false);
          });
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, fetchItems]);

  // Realtime: new items appear at top, deleted items removed
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel("gallery-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "gallery_items",
        },
        () => {
          // Skip if we just uploaded — handleUploadComplete already refetched
          if (justUploadedRef.current) {
            justUploadedRef.current = false;
            return;
          }
          // Another user uploaded — refetch
          fetchItems().then((data) => {
            setItems(data.items);
            setHasMore(data.hasMore);
            if (data.items.length > 0) {
              cursorRef.current = sortBy === "uploaded" ? data.items[data.items.length - 1].created_at : data.items[data.items.length - 1].sort_date;
            }
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "gallery_items",
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) {
            setItems((prev) => prev.filter((i) => i.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems]);

  const handleUploadComplete = () => {
    // Mark that we just uploaded, so realtime skips its refetch
    justUploadedRef.current = true;
    // Refetch to show the new item immediately
    fetchItems().then((data) => {
      setItems(data.items);
      setHasMore(data.hasMore);
      if (data.items.length > 0) {
        cursorRef.current = sortBy === "uploaded" ? data.items[data.items.length - 1].created_at : data.items[data.items.length - 1].sort_date;
      }
    });
  };

  const handleDelete = async (itemId: string) => {
    const res = await fetch(`/api/gallery/${itemId}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      setViewerIndex(null);
    }
  };

  return (
    <>
      {/* Header + Filters */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <h1 className="text-2xl font-bold text-gray-900 flex-shrink-0">Photos</h1>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
        {/* Sort toggle — single button, tap to swap */}
        <button
          onClick={() => setSortBy(sortBy === "taken" ? "uploaded" : "taken")}
          className="px-3 py-1.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
          {sortBy === "taken" ? "Date Taken" : "Date Uploaded"}
        </button>

        {/* Year filter */}
        {availableYears.length > 0 && (
          <div className="relative">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className={`pl-7 pr-2 py-1.5 text-xs font-medium rounded-full border-0 outline-none transition-colors appearance-none cursor-pointer ${
                filterYear !== "all"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <option value="all">All</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Loozer filter */}
        {taggedUsers.length > 0 && (
          <button
            onClick={() => setShowFilterUsers(!showFilterUsers)}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors flex items-center gap-1 ${
              filterUserIds.size > 0
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {filterUserIds.size > 0 && (
              <span>{filterUserIds.size}</span>
            )}
          </button>
        )}

        {/* Clear filters — only shown when Loozer filter picker is open */}
        {showFilterUsers && filterUserIds.size > 0 && (
          <button
            onClick={() => {
              setFilterUserIds(new Set());
            }}
            className="px-2 py-1.5 text-xs text-red-500 font-medium"
          >
            Clear
          </button>
        )}
        </div>
      </div>

      {/* Loozer filter picker */}
      {showFilterUsers && (
        <div className="mb-4 bg-gray-50 rounded-xl p-3">
          <div className="flex flex-wrap gap-1.5">
            {taggedUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  setFilterUserIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(u.id)) next.delete(u.id);
                    else next.add(u.id);
                    return next;
                  });
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                  filterUserIds.has(u.id)
                    ? "bg-green-600 text-white"
                    : "bg-white text-gray-700 border border-gray-200"
                }`}
              >
                {u.display_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square bg-gray-100 rounded-sm animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-lg font-medium mb-1">No photos yet</p>
          <p className="text-sm">Be the first to share a moment!</p>
        </div>
      )}

      {/* Thumbnail grid */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-3 gap-1">
          {items.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setViewerIndex(index)}
              className="relative aspect-square overflow-hidden rounded-sm bg-gray-100"
            >
              {/* Show thumbnail image, or a placeholder for videos without one */}
              {item.thumbnail_url ? (
                <img
                  src={item.thumbnail_url}
                  alt={item.caption || "Gallery item"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : item.media_type === "video" ? (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <svg className="w-10 h-10 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              ) : (
                <img
                  src={item.media_url}
                  alt={item.caption || "Gallery item"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              )}
              {/* Video play icon overlay (when thumbnail exists) */}
              {item.media_type === "video" && item.thumbnail_url && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 bg-black/50 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              )}
              {/* Reaction/comment indicators */}
              {(item.reactionCount > 0 || item.commentCount > 0) && (
                <div className="absolute bottom-1 right-1 flex items-center gap-1">
                  {item.reactionCount > 0 && (
                    <span className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      {item.reactionCount}
                    </span>
                  )}
                  {item.commentCount > 0 && (
                    <span className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                      </svg>
                      {item.commentCount}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && !loading && <div ref={sentinelRef} className="h-10" />}

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Upload FAB — triggers native file picker directly */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className={`fixed right-4 z-20 w-14 h-14 bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all ${musicPlayerVisible ? "bottom-40" : "bottom-24"}`}
      >
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) setSelectedFile(f);
        }}
      />

      {/* Upload modal — shown after file is selected */}
      {selectedFile && (
        <MediaUploader
          tripId={activeTripId}
          userId={userId}
          allUsers={allUsers}
          initialFile={selectedFile}
          onUploadComplete={handleUploadComplete}
          onClose={() => {
            setSelectedFile(null);
            // Reset file input so the same file can be re-selected next time
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      )}

      {/* Full-screen viewer */}
      {viewerIndex !== null && (
        <MediaViewer
          items={items}
          initialIndex={viewerIndex}
          currentUserId={userId}
          isAdmin={isAdmin}
          allUsers={allUsers}
          onClose={() => {
            setViewerIndex(null);
            setDeepLinkShowComments(false);
          }}
          onDelete={handleDelete}
          initialShowComments={deepLinkShowComments}
        />
      )}
    </>
  );
}
