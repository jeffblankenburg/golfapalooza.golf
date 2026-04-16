"use client";

import { useState, useRef } from "react";
import { GalleryImagePicker } from "./GalleryImagePicker";
import { SongArtworkPicker } from "./SongArtworkPicker";
import { FocalPointSelector } from "./FocalPointSelector";

export interface ArticleImageValue {
  source: "gallery" | "upload" | "song_art";
  galleryItemId?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  focalX: number;
  focalY: number;
}

interface ArticleImagePickerProps {
  tripId: string;
  value: ArticleImageValue | null;
  onChange: (value: ArticleImageValue | null) => void;
}

export function ArticleImagePicker({ tripId, value, onChange }: ArticleImagePickerProps) {
  const [showGallery, setShowGallery] = useState(false);
  const [showSongArt, setShowSongArt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tripId", tripId);

      const res = await fetch("/api/admin/articles/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.url) {
        onChange({
          source: "upload",
          imageUrl: data.url,
          focalX: 50,
          focalY: 50,
        });
      }
    } catch {
      // Upload failed silently
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // If an image is selected, show it with focal point selector
  if (value) {
    return (
      <div>
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          Featured Image
        </label>
        <div className="mt-1 space-y-2">
          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 flex-1">
              {value.source === "gallery" ? "From gallery" : value.source === "upload" ? "Uploaded" : "Song artwork"}
            </span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-red-500 font-medium"
            >
              Remove
            </button>
          </div>

          {/* Focal point selector */}
          <FocalPointSelector
            imageUrl={value.imageUrl}
            focalX={value.focalX}
            focalY={value.focalY}
            onChange={(fx, fy) => onChange({ ...value, focalX: fx, focalY: fy })}
          />
        </div>
      </div>
    );
  }

  // No image selected — show source options
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        Featured Image
      </label>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {/* Gallery */}
        <button
          type="button"
          onClick={() => setShowGallery(true)}
          className="flex flex-col items-center gap-1.5 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 active:bg-gray-50"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[11px] font-medium">Gallery</span>
        </button>

        {/* Upload */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center gap-1.5 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 active:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? (
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )}
          <span className="text-[11px] font-medium">Upload</span>
        </button>

        {/* Song Artwork */}
        <button
          type="button"
          onClick={() => setShowSongArt(true)}
          className="flex flex-col items-center gap-1.5 py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-400 active:bg-gray-50"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span className="text-[11px] font-medium">Song Art</span>
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />

      {/* Gallery picker modal */}
      <GalleryImagePicker
        open={showGallery}
        selectedId={null}
        onSelect={(item) => {
          if (item) {
            onChange({
              source: "gallery",
              galleryItemId: item.id,
              imageUrl: item.media_url,
              thumbnailUrl: item.thumbnail_url || undefined,
              focalX: 50,
              focalY: 50,
            });
          }
        }}
        onClose={() => setShowGallery(false)}
      />

      {/* Song artwork picker modal */}
      <SongArtworkPicker
        open={showSongArt}
        onSelect={(song) => {
          onChange({
            source: "song_art",
            imageUrl: song.art_url,
            thumbnailUrl: song.art_thumb_url || undefined,
            focalX: 50,
            focalY: 50,
          });
        }}
        onClose={() => setShowSongArt(false)}
      />
    </div>
  );
}
