"use client";

import { useState, useEffect } from "react";

interface Song {
  id: string;
  title: string;
  art_url: string;
  art_thumb_url: string | null;
}

export function SongArtworkPicker({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (song: Song) => void;
  onClose: () => void;
}) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && songs.length === 0) {
      setLoading(true);
      fetch("/api/admin/articles/song-artwork")
        .then((res) => res.json())
        .then((data) => {
          setSongs(data.songs || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [open, songs.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-lg font-semibold">Song Artwork</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : songs.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-12">
              No songs with artwork found.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {songs.map((song) => (
                <button
                  key={song.id}
                  onClick={() => {
                    onSelect(song);
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
          )}
        </div>
      </div>
    </div>
  );
}
