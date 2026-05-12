"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { compressImage, compressVideo } from "@/lib/gallery/compress";

interface StoredMedia {
  name: string;
  url: string;
  created_at: string;
  kind?: "image" | "video";
}

interface ArticleImageDrawerProps {
  open: boolean;
  onSelect: (url: string) => void;
  onClose: () => void;
}

function classifyUrl(url: string): "image" | "video" {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url) ? "video" : "image";
}

export function ArticleImageDrawer({ open, onSelect, onClose }: ArticleImageDrawerProps) {
  const [media, setMedia] = useState<StoredMedia[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/admin/articles/upload-image")
      .then((res) => res.json())
      .then((data) => setMedia(data.images || []))
      .catch(() => setMedia([]))
      .finally(() => setLoading(false));
  }, [open]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    setUploading(true);
    setUploadStatus(isVideo ? "Compressing video..." : "Uploading...");
    try {
      // Client-side compression keeps article media small and prevents
      // hitting the upload route's size cap. compressImage and
      // compressVideo both fall through their no-op paths when the
      // input is already smaller than the target.
      let blob: Blob = file;
      let uploadName = file.name;
      if (isImage) {
        try {
          const compressed = await compressImage(file, 1920, 0.85);
          blob = compressed.blob;
          uploadName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
        } catch (err) {
          console.warn("Article image compression failed; uploading original.", err);
        }
      } else if (isVideo) {
        try {
          const compressed = await compressVideo(file, {
            maxHeight: 720,
            bitrate: 2_500_000,
            onProgress: (pct) => setUploadStatus(`Compressing video... ${Math.round(pct)}%`),
          });
          blob = compressed.blob;
          const ext = blob.type.includes("webm") ? "webm" : "mp4";
          uploadName = file.name.replace(/\.[^.]+$/, "") + "." + ext;
        } catch (err) {
          console.warn("Article video compression failed; uploading original.", err);
        }
      }

      setUploadStatus("Uploading...");
      const wrapped = new File([blob], uploadName, { type: blob.type || file.type });
      const formData = new FormData();
      formData.append("file", wrapped);

      const res = await fetch("/api/admin/articles/upload-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (data.error) {
        console.error("Media upload failed:", data.error);
        return;
      }

      onSelect(data.url);
    } catch {
      console.error("Media upload failed");
    } finally {
      setUploading(false);
      setUploadStatus(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [onSelect]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up pb-safe">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-lg font-semibold">Insert Image or Video</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Upload new */}
        <div className="px-4 pb-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-semibold text-gray-600 active:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                {uploadStatus || "Uploading..."}
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload New
              </>
            )}
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleUpload}
        />

        {/* Existing media */}
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : media.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-4">No previously uploaded media.</p>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Previously Uploaded</p>
              <div className="grid grid-cols-3 gap-2">
                {media.map((m) => {
                  const kind = m.kind ?? classifyUrl(m.url);
                  return (
                    <button
                      key={m.name}
                      onClick={() => onSelect(m.url)}
                      className="relative aspect-square rounded-xl border border-gray-200 overflow-hidden active:ring-2 active:ring-green-500 hover:ring-2 hover:ring-green-300 transition-shadow bg-black"
                    >
                      {kind === "video" ? (
                        <>
                          <video
                            src={m.url}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                          />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-9 h-9 rounded-full bg-black/55 flex items-center justify-center">
                              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        </>
                      ) : (
                        <img
                          src={m.url}
                          alt={m.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
