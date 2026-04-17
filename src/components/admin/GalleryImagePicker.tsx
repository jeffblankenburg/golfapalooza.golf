"use client";

import { useState, useEffect } from "react";

interface GalleryItem {
  id: string;
  media_url: string;
  thumbnail_url: string | null;
}

interface Song {
  id: string;
  title: string;
  art_url: string;
  art_thumb_url: string | null;
}

export function GalleryImagePicker({
  open,
  selectedId,
  onSelect,
  onSelectUrl,
  onClose,
}: {
  open: boolean;
  selectedId: string | null;
  onSelect: (item: GalleryItem | null) => void;
  onSelectUrl?: (url: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"gallery" | "album_art">("gallery");
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [loadingSongs, setLoadingSongs] = useState(false);

  useEffect(() => {
    if (open && items.length === 0) {
      setLoadingGallery(true);
      fetch("/api/gallery?media_type=photo&limit=60")
        .then((res) => res.json())
        .then((data) => setItems(data.items || []))
        .catch(() => {})
        .finally(() => setLoadingGallery(false));
    }
  }, [open, items.length]);

  useEffect(() => {
    if (open && tab === "album_art" && songs.length === 0) {
      setLoadingSongs(true);
      fetch("/api/admin/articles/song-artwork")
        .then((res) => res.json())
        .then((data) => setSongs(data.songs || []))
        .catch(() => {})
        .finally(() => setLoadingSongs(false));
    }
  }, [open, tab, songs.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up pb-safe">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-lg font-semibold">Select Photo</h2>
          <div className="flex items-center gap-2">
            {selectedId && (
              <button
                onClick={() => onSelect(null)}
                className="text-sm text-red-500 font-medium"
              >
                Remove
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3">
          <button
            onClick={() => setTab("gallery")}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === "gallery" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            Gallery
          </button>
          <button
            onClick={() => setTab("album_art")}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === "album_art" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            Album Art
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {tab === "gallery" ? (
            loadingGallery ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">No photos in the gallery yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelect(item);
                      onClose();
                    }}
                    className={`relative aspect-square overflow-hidden rounded-lg ${
                      item.id === selectedId ? "ring-3 ring-green-500" : ""
                    }`}
                  >
                    <img
                      src={item.thumbnail_url || item.media_url}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {item.id === selectedId && (
                      <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center">
                        <svg className="w-8 h-8 text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )
          ) : (
            loadingSongs ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : songs.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">No songs with artwork found.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {songs.map((song) => (
                  <button
                    key={song.id}
                    onClick={() => {
                      if (onSelectUrl) {
                        onSelectUrl(song.art_url);
                      } else {
                        onSelect({ id: song.id, media_url: song.art_url, thumbnail_url: song.art_thumb_url });
                      }
                      onClose();
                    }}
                    className="relative aspect-square overflow-hidden rounded-lg"
                  >
                    <img
                      src={song.art_thumb_url || song.art_url}
                      alt={song.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                      <p className="text-[10px] text-white font-medium leading-tight truncate">
                        {song.title}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
