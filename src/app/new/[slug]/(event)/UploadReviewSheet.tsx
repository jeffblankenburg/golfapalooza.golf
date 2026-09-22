"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ViewerUser } from "./MediaViewer";
/* eslint-disable @next/next/no-img-element */

export interface UploadEntry {
  file: File;
  caption: string | null;
  taggedUserIds: string[];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

/**
 * Pre-upload review modal. Mirrors v1's caption/tag-at-upload affordance,
 * adapted to v2's bulk flow: page through the picked files, caption + tag each
 * one, with "apply to all" toggles that mirror the current photo's caption /
 * tags across the whole batch. Confirm hands per-file entries back to the
 * uploader (each still editable later in the viewer).
 *
 * Rendered through a portal to <body> so it sits above the Photos drawer rather
 * than nesting inside it (a fixed child of a transformed ancestor would clip).
 */
export default function UploadReviewSheet({
  files,
  allUsers,
  onCancel,
  onConfirm,
}: {
  files: File[];
  allUsers: ViewerUser[];
  onCancel: () => void;
  onConfirm: (entries: UploadEntry[]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [captions, setCaptions] = useState<string[]>(() => files.map(() => ""));
  const [tags, setTags] = useState<Set<string>[]>(() => files.map(() => new Set<string>()));
  const [applyCaptionAll, setApplyCaptionAll] = useState(false);
  const [applyTagsAll, setApplyTagsAll] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [search, setSearch] = useState("");

  // Object-URL previews. Created and revoked in the SAME effect so a StrictMode
  // remount produces fresh URLs (a useMemo + separate revoke-cleanup would leave
  // the <img> srcs pointing at already-revoked blobs → black frames). Syncing an
  // external resource (blob URLs) into state is the intended use of an effect here.
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pairing create/revoke with the effect lifecycle is required for StrictMode-safe blob URLs
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const total = files.length;
  const isVideo = files[index]?.type.startsWith("video/");
  const curTags = tags[index] ?? new Set<string>();

  const setCaption = (val: string) =>
    setCaptions((prev) => {
      const next = [...prev];
      if (applyCaptionAll) return next.fill(val);
      next[index] = val;
      return next;
    });

  const toggleTag = (id: string) =>
    setTags((prev) => {
      const next = prev.map((s) => new Set(s));
      if (applyTagsAll) {
        const has = next[index].has(id);
        next.forEach((s) => (has ? s.delete(id) : s.add(id)));
      } else if (next[index].has(id)) {
        next[index].delete(id);
      } else {
        next[index].add(id);
      }
      return next;
    });

  // Enabling an "apply to all" toggle seeds every photo from the current one.
  const toggleCaptionAll = () =>
    setApplyCaptionAll((on) => {
      const next = !on;
      if (next) setCaptions((prev) => prev.map(() => prev[index]));
      return next;
    });
  const toggleTagsAll = () =>
    setApplyTagsAll((on) => {
      const next = !on;
      if (next) setTags((prev) => prev.map(() => new Set(prev[index])));
      return next;
    });

  const confirm = () =>
    onConfirm(
      files.map((file, i) => ({
        file,
        caption: captions[i].trim() || null,
        taggedUserIds: [...tags[i]],
      })),
    );

  const filtered = search
    ? allUsers.filter((u) => u.display_name.toLowerCase().includes(search.toLowerCase()))
    : allUsers;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <button onClick={onCancel} className="text-sm font-medium text-gray-500 w-16 text-left">
            Cancel
          </button>
          <h2 className="text-base font-semibold text-gray-900 truncate">
            {total > 1 ? `Review ${total} photos` : "Add photo"}
          </h2>
          <button onClick={confirm} className="text-sm font-semibold text-green-600 w-16 text-right">
            {total > 1 ? `Upload ${total}` : "Upload"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="relative bg-black flex items-center justify-center h-72">
            {previews[index] &&
              (isVideo ? (
                <video src={previews[index]} className="max-w-full max-h-full object-contain" muted playsInline />
              ) : (
                <img src={previews[index]} alt="" className="max-w-full max-h-full object-contain" />
              ))}
            {total > 1 && (
              <>
                {index > 0 && (
                  <button
                    onClick={() => setIndex((i) => i - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Previous"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                {index < total - 1 && (
                  <button
                    onClick={() => setIndex((i) => i + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center active:scale-90 transition-transform"
                    aria-label="Next"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/90 text-xs bg-black/40 rounded-full px-2 py-0.5">
                  {index + 1} / {total}
                </span>
              </>
            )}
          </div>

          <div className="px-4 py-4 space-y-4">
            <div>
              <input
                type="text"
                value={captions[index] ?? ""}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption..."
                className="w-full px-3 py-2 text-base border border-gray-300 rounded-lg focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
              />
              {total > 1 && (
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={applyCaptionAll}
                    onChange={toggleCaptionAll}
                    className="w-4 h-4 accent-green-600"
                  />
                  Apply caption to all
                </label>
              )}
            </div>

            <div>
              <button
                onClick={() => setShowTagPicker((v) => !v)}
                className="flex items-center gap-2 text-sm font-medium text-gray-900"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {curTags.size > 0 ? `${curTags.size} Loozer${curTags.size !== 1 ? "s" : ""} tagged` : "Tag Loozers"}
              </button>

              {curTags.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...curTags].map((id) => {
                    const u = allUsers.find((x) => x.id === id);
                    if (!u) return null;
                    return (
                      <span key={id} className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5">
                        {u.display_name}
                      </span>
                    );
                  })}
                </div>
              )}

              {total > 1 && (
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={applyTagsAll}
                    onChange={toggleTagsAll}
                    className="w-4 h-4 accent-green-600"
                  />
                  Apply tags to all
                </label>
              )}

              {showTagPicker && (
                <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search..."
                      className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md outline-none focus:border-green-600"
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filtered.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => toggleTag(u.id)}
                        className="flex items-center gap-3 w-full px-3 py-2 border-b border-gray-50 last:border-0"
                      >
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                            curTags.has(u.id) ? "bg-green-600 border-green-600" : "border-gray-300"
                          }`}
                        >
                          {curTags.has(u.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[0.625rem] font-semibold">{getInitials(u.display_name)}</span>
                          )}
                        </div>
                        <span className="text-sm text-gray-900">{u.display_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
