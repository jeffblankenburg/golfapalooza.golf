"use client";

import { useState, useEffect } from "react";
import {
  compressImage,
  generateThumbnail,
  extractVideoFrame,
  validateVideo,
  isVideoFile,
} from "@/lib/gallery/compress";
import { logActivity } from "@/components/ActivityTracker";
import { extractExifDate, extractVideoDate } from "@/lib/gallery/exif";

interface GalleryUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function MediaUploader({
  tripId,
  userId,
  allUsers,
  initialFile,
  onUploadComplete,
  onClose,
}: {
  tripId: string | null;
  userId: string;
  allUsers: GalleryUser[];
  initialFile: File;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUploadComplete: (item: any) => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [taggedUserIds, setTaggedUserIds] = useState<Set<string>>(new Set());
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  // Validate and create preview on mount
  useEffect(() => {
    if (isVideoFile(initialFile)) {
      const videoError = validateVideo(initialFile);
      if (videoError) {
        setError(videoError);
        return;
      }
    }
    try {
      const url = URL.createObjectURL(initialFile);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to create preview:", err);
      setError("Could not load file preview. Please try selecting the file again.");
    }
  }, [initialFile]);

  const handleUpload = async () => {
    setUploading(true);
    setError(null);

    try {
      const mediaType = isVideoFile(initialFile) ? "video" : "photo";
      const formData = new FormData();
      if (tripId) formData.set("tripId", tripId);
      formData.set("mediaType", mediaType);
      if (caption.trim()) formData.set("caption", caption.trim());

      if (mediaType === "photo") {
        // Extract EXIF date BEFORE compression (Canvas strips EXIF)
        setProgress("Reading photo date...");
        const exifDate = await extractExifDate(initialFile);
        if (exifDate) {
          formData.set("takenAt", exifDate.toISOString());
        }

        setProgress("Compressing image...");
        const { blob, width, height } = await compressImage(initialFile, 1280, 0.8);
        formData.set("file", blob, "photo.jpg");
        formData.set("width", String(width));
        formData.set("height", String(height));

        setProgress("Creating thumbnail...");
        const thumbBlob = await generateThumbnail(initialFile);
        formData.set("thumbnailFile", thumbBlob, "thumb.jpg");
      } else {
        // Video path — upload original file (no compression, preserves audio)
        setProgress("Reading video date...");
        const videoDate = await extractVideoDate(initialFile);
        if (videoDate) {
          formData.set("takenAt", videoDate.toISOString());
        }

        // Get video dimensions from the file
        setProgress("Reading video...");
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        const videoUrl = URL.createObjectURL(initialFile);
        video.src = videoUrl;
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => resolve();
          video.load();
        });
        const vw = video.videoWidth || 0;
        const vh = video.videoHeight || 0;
        URL.revokeObjectURL(videoUrl);

        formData.set("file", initialFile, initialFile.name);
        if (vw > 0) formData.set("width", String(vw));
        if (vh > 0) formData.set("height", String(vh));

        setProgress("Generating thumbnail...");
        try {
          const frameBlob = await extractVideoFrame(initialFile);
          formData.set("thumbnailFile", frameBlob, "thumb.jpg");
        } catch (err) {
          console.warn("Video thumbnail extraction failed:", err);
        }
      }

      setProgress("Uploading...");
      setUploadPct(0);

      // Get the file and thumbnail from formData
      const uploadFile = formData.get("file") as File;
      const uploadThumb = formData.get("thumbnailFile") as File | null;

      // Step 1: Get signed upload URL
      const urlRes = await fetch("/api/gallery/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          mediaType,
          fileName: uploadFile.name,
        }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json();
        throw new Error(err.error || "Failed to get upload URL");
      }
      const { signedUrl, token, publicUrl, thumbSignedUrl, thumbPublicUrl } = await urlRes.json();

      // Step 2: Upload file directly to Supabase Storage with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("x-upsert", "false");
        if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        const contentType = uploadFile.type || (mediaType === "video" ? "video/mp4" : "image/jpeg");
        xhr.setRequestHeader("Content-Type", contentType);

        let gotProgress = false;
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            gotProgress = true;
            setUploadPct(Math.min(95, Math.round((e.loaded / e.total) * 100)));
          } else if (e.loaded > 0) {
            gotProgress = true;
            setUploadPct(null);
          }
        });

        xhr.upload.addEventListener("load", () => {
          setUploadPct(95);
        });

        const fallbackTimer = setTimeout(() => {
          if (!gotProgress) setUploadPct(null);
        }, 3000);

        xhr.onload = () => {
          clearTimeout(fallbackTimer);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };

        xhr.onerror = () => {
          clearTimeout(fallbackTimer);
          reject(new Error("Network error during upload"));
        };
        xhr.send(uploadFile);
      });

      // Step 2b: Upload thumbnail directly if available
      let finalThumbUrl = thumbPublicUrl;
      if (uploadThumb && thumbSignedUrl) {
        try {
          const thumbRes = await fetch(thumbSignedUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "image/jpeg",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: uploadThumb,
          });
          if (!thumbRes.ok) finalThumbUrl = null;
        } catch {
          finalThumbUrl = null;
        }
      } else {
        finalThumbUrl = null;
      }

      // Step 3: Save metadata via API (JSON, no file — bypasses body limit)
      setProgress("Saving...");
      setUploadPct(null);

      const metaRes = await fetch("/api/gallery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaUrl: publicUrl,
          thumbnailUrl: finalThumbUrl,
          mediaType,
          tripId,
          caption: caption.trim() || null,
          takenAt: formData.get("takenAt") || null,
          width: formData.get("width") ? parseInt(formData.get("width") as string, 10) : null,
          height: formData.get("height") ? parseInt(formData.get("height") as string, 10) : null,
        }),
      });

      if (!metaRes.ok) {
        const err = await metaRes.json();
        throw new Error(err.error || "Failed to save media");
      }

      const data = await metaRes.json();
      setUploadPct(null);
      const itemId = data.item.id;

      // Create tags if any were selected
      if (taggedUserIds.size > 0) {
        setProgress("Tagging Loozers...");
        await fetch(`/api/gallery/${itemId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: [...taggedUserIds] }),
        });
      }

      const enrichedItem = {
        ...data.item,
        uploader: Array.isArray(data.item.uploader)
          ? data.item.uploader[0]
          : data.item.uploader,
        reactions: {},
        reactionCount: 0,
        tags: [...taggedUserIds],
        commentCount: 0,
      };

      logActivity("gallery_upload", "/gallery", {
        media_type: mediaType,
        tagged_users: taggedUserIds.size,
        has_caption: !!caption.trim(),
      });
      onUploadComplete(enrichedItem);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setProgress(null);
      setUploadPct(null);
    }
  };

  const toggleTag = (id: string) => {
    setTaggedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Inline tag picker view
  if (showTagPicker) {
    return (
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
        <div
          className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl animate-slide-up max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          <div className="flex items-center justify-between px-4 pb-3">
            <h2 className="text-lg font-bold text-gray-900">Tag Loozers</h2>
            <button
              onClick={() => setShowTagPicker(false)}
              className="text-green-600 text-sm font-semibold"
            >
              Done
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {allUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => toggleTag(user.id)}
                className="flex items-center gap-3 w-full py-2.5 border-b border-gray-100"
              >
                <div
                  className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                    taggedUserIds.has(user.id)
                      ? "bg-green-600 border-green-600"
                      : "border-gray-300"
                  }`}
                >
                  {taggedUserIds.has(user.id) && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-green-700 text-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[11px] font-semibold">{getInitials(user.display_name)}</span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900">{user.display_name}</span>
              </button>
            ))}
          </div>

          <div className="px-4 pt-4 pb-24 border-t border-gray-200">
            <button
              onClick={() => setShowTagPicker(false)}
              className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl active:scale-95 transition-transform"
            >
              {taggedUserIds.size > 0
                ? `Done (${taggedUserIds.size} tagged)`
                : "Done"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="px-4 pb-24">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Share a Moment</h2>
            <button
              onClick={onClose}
              className="text-gray-500 text-sm font-medium"
            >
              Cancel
            </button>
          </div>

          {/* Preview */}
          {preview && (
            <div className="relative mb-4">
              {isVideoFile(initialFile) ? (
                <video
                  src={preview}
                  className="w-full max-h-64 object-contain rounded-xl bg-black"
                  controls
                />
              ) : (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-full max-h-64 object-contain rounded-xl bg-gray-50"
                />
              )}
            </div>
          )}

          {/* Caption */}
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption..."
            autoFocus
            className="w-full px-4 py-3 text-[16px] border border-gray-300 rounded-xl mb-3 focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
          />

          {/* Tag Loozers button */}
          <button
            onClick={() => setShowTagPicker(true)}
            className="w-full flex items-center gap-3 px-4 py-3 border border-gray-300 rounded-xl mb-4 active:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-sm text-gray-700 flex-1 text-left">
              {taggedUserIds.size > 0
                ? `${taggedUserIds.size} Loozer${taggedUserIds.size !== 1 ? "s" : ""} tagged`
                : "Tag Loozers"}
            </span>
            {taggedUserIds.size > 0 && (
              <div className="flex -space-x-1.5">
                {[...taggedUserIds].slice(0, 5).map((id) => {
                  const u = allUsers.find((au) => au.id === id);
                  if (!u) return null;
                  return (
                    <div
                      key={id}
                      className="w-6 h-6 rounded-full bg-green-700 text-white flex items-center justify-center border-2 border-white overflow-hidden"
                    >
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.display_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[8px] font-semibold">{getInitials(u.display_name)}</span>
                      )}
                    </div>
                  );
                })}
                {taggedUserIds.size > 5 && (
                  <div className="w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center border-2 border-white text-[8px] font-semibold">
                    +{taggedUserIds.size - 5}
                  </div>
                )}
              </div>
            )}
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm mb-4">{error}</p>
          )}

          {/* Progress */}
          {progress && (
            <div className="mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="flex-1">{progress}</span>
                {uploadPct != null && (
                  <span className="font-medium tabular-nums">{uploadPct}%</span>
                )}
              </div>
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                {uploadPct != null ? (
                  <div
                    className="h-full bg-green-600 rounded-full transition-all duration-200"
                    style={{ width: `${uploadPct}%` }}
                  />
                ) : uploading && progress === "Uploading..." ? (
                  <div className="h-full w-1/3 bg-green-600 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite]" />
                ) : null}
              </div>
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={uploading || !!error}
            className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
          >
            {uploading ? "Uploading..." : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
