"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
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

interface TripOption {
  id: string;
  trip_year: number;
}

export function GalleryPage({
  activeTripId,
  allTrips,
  userId,
  userName,
  isAdmin,
  allUsers,
}: {
  activeTripId: string | null;
  allTrips: TripOption[];
  userId: string;
  userName: string;
  isAdmin: boolean;
  allUsers: GalleryUser[];
}) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // const [filterTripId, setFilterTripId] = useState<string | "all">("all");
  const [sortBy, setSortBy] = useState<"taken" | "uploaded">("taken");
  const sentinelRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(
    async (cursor?: string): Promise<{ items: GalleryItem[]; hasMore: boolean }> => {
      const params = new URLSearchParams({ limit: "24" });
      // if (filterTripId !== "all") {
      //   params.set("trip_id", filterTripId);
      // }
      if (sortBy === "uploaded") params.set("sort_by", "uploaded");
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
    [sortBy]
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
          // Refetch latest items to get full enriched data
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

  const handleUploadComplete = (newItem: GalleryItem) => {
    setItems((prev) => [newItem, ...prev]);
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Photos</h1>
        <span className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Sort toggle */}
      <div className="flex items-center gap-1 mb-4">
        <button
          onClick={() => setSortBy("taken")}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            sortBy === "taken"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          Date Taken
        </button>
        <button
          onClick={() => setSortBy("uploaded")}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
            sortBy === "uploaded"
              ? "bg-green-600 text-white"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          Date Uploaded
        </button>
      </div>

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
                    <span className="bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-full">
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
        className="fixed bottom-24 right-4 z-20 w-14 h-14 bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
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
          // Reset so the same file can be re-selected
          e.target.value = "";
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
          onClose={() => setSelectedFile(null)}
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
          onClose={() => setViewerIndex(null)}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
