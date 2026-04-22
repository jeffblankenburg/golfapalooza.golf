"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface FakeAd {
  id: string;
  image_url: string;
  alt_text: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  tagged_user_ids: string[];
}

interface User {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_active?: boolean;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

export function FakeAdManager() {
  const [ads, setAds] = useState<FakeAd[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [taggedIds, setTaggedIds] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<FakeAd | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    const [adsRes, usersRes] = await Promise.all([
      fetch("/api/admin/fake-ads"),
      fetch("/api/admin/users"),
    ]);
    const adsData = await adsRes.json();
    const usersData = await usersRes.json();
    setAds(adsData.ads || []);
    setAllUsers((usersData.users || []).filter((u: User) => u.is_active !== false));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const resetForm = () => {
    setEditId(null);
    setFile(null);
    setPreviewUrl(null);
    setAltText("");
    setTaggedIds(new Set());
    setActive(true);
    setError(null);
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (ad: FakeAd) => {
    setEditId(ad.id);
    setFile(null);
    setPreviewUrl(ad.image_url);
    setAltText(ad.alt_text || "");
    setTaggedIds(new Set(ad.tagged_user_ids));
    setActive(ad.active);
    setError(null);
    setShowForm(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB");
      return;
    }

    const objectUrl = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      const targetRatio = 3;
      const tolerance = 0.04; // ~1.3% — forgiving for creative slightly off spec
      if (Math.abs(ratio - targetRatio) > tolerance) {
        URL.revokeObjectURL(objectUrl);
        setError(
          `Image must be 3:1 aspect ratio (like 1200×400). Got ${img.width}×${img.height} (${ratio.toFixed(2)}:1).`
        );
        return;
      }
      if (img.width < 1200) {
        URL.revokeObjectURL(objectUrl);
        setError(`Image must be at least 1200px wide (for retina displays). Got ${img.width}×${img.height}.`);
        return;
      }
      setError(null);
      setFile(f);
      setPreviewUrl(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("Could not read image file");
    };
    img.src = objectUrl;
  };

  const toggleTag = (userId: string) => {
    setTaggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (editId) {
        const res = await fetch(`/api/admin/fake-ads/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alt_text: altText.trim() || null,
            active,
            tagged_user_ids: Array.from(taggedIds),
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Update failed");
        }
      } else {
        if (!file) {
          setError("Please choose an image");
          setSaving(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", file);
        if (altText.trim()) formData.append("alt_text", altText.trim());
        formData.append("active", String(active));
        formData.append("tagged_user_ids", JSON.stringify(Array.from(taggedIds)));
        const res = await fetch("/api/admin/fake-ads", {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }
      }
      await fetchData();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/admin/fake-ads/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    await fetchData();
  };

  const toggleActive = async (ad: FakeAd) => {
    await fetch(`/api/admin/fake-ads/${ad.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !ad.active }),
    });
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (showForm) {
    const taggedUsers = allUsers.filter((u) => taggedIds.has(u.id));
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={resetForm} className="text-sm text-green-700 font-medium">
            &larr; Back to list
          </button>
          <span className="text-sm text-gray-400">{editId ? "Edit Ad" : "New Ad"}</span>
        </div>

        {!editId && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
              Banner Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
              id="fake-ad-file-input"
            />
            {!previewUrl ? (
              <label
                htmlFor="fake-ad-file-input"
                className="flex flex-col items-center justify-center w-full py-10 px-4 bg-green-50 border-2 border-dashed border-green-300 rounded-2xl text-green-700 active:bg-green-100 transition-colors cursor-pointer"
              >
                <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-semibold">Tap to choose image</span>
                <span className="text-xs text-green-600/70 mt-0.5">or take a photo</span>
              </label>
            ) : (
              <label
                htmlFor="fake-ad-file-input"
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-white border border-gray-300 rounded-xl text-gray-700 text-sm font-medium active:bg-gray-50 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Replace image
              </label>
            )}
            <p className="text-xs text-gray-500 mt-2">
              Required: <strong>1200&times;400</strong> (or any 3:1 size — 1500&times;500, 1800&times;600). Sized for retina phone displays. PNG or JPG, under 10MB.
            </p>
          </div>
        )}

        {previewUrl && (
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
              Preview (at home page width)
            </label>
            <div className="bg-gray-100 rounded-xl overflow-hidden border border-gray-200">
              <img src={previewUrl} alt="" className="w-full h-auto block" />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
            Alt Text (accessibility)
          </label>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="e.g. Bass Pro Shops — Outfish him. Outdrink him."
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
            Tagged Loozers ({taggedIds.size})
          </label>
          <p className="text-xs text-gray-500 mb-2">
            Clicking this ad on the home page jumps to a tagged Loozer&apos;s profile (random if multiple). Leave empty for un-tagged ads.
          </p>
          {taggedUsers.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {taggedUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggleTag(u.id)}
                  className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-800 border border-green-200 rounded-full text-xs font-medium"
                >
                  {u.display_name}
                  <span className="text-green-600">&times;</span>
                </button>
              ))}
            </div>
          )}
          <div className="max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {allUsers.map((u) => {
              const selected = taggedIds.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => toggleTag(u.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left active:bg-gray-50 ${
                    selected ? "bg-green-50" : ""
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {u.avatar_url ? (
                      <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-gray-600">
                        {getInitials(u.display_name)}
                      </span>
                    )}
                  </div>
                  <span className="flex-1 text-sm text-gray-900">{u.display_name}</span>
                  {selected && (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="w-4 h-4 rounded"
          />
          Active (visible to Loozers)
        </label>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || (!editId && !file)}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : editId ? "Save Changes" : "Upload Ad"}
          </button>
          <button
            onClick={resetForm}
            className="px-4 text-sm text-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Ads ({ads.length})
        </h2>
        <button
          onClick={openNew}
          className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80"
        >
          New Ad
        </button>
      </div>

      {ads.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">
          No ads yet. Upload your first banner!
        </p>
      ) : (
        <div className="space-y-3">
          {ads.map((ad) => {
            const taggedUsers = allUsers.filter((u) => ad.tagged_user_ids.includes(u.id));
            return (
              <div
                key={ad.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                title={ad.alt_text || undefined}
              >
                <img
                  src={ad.image_url}
                  alt={ad.alt_text || ""}
                  className={`w-full h-auto block ${ad.active ? "" : "opacity-40"}`}
                />
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    onClick={() => toggleActive(ad)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${
                      ad.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {ad.active ? "Active" : "Inactive"}
                  </button>
                  <div className="flex-1 flex flex-wrap gap-1 min-w-0">
                    {taggedUsers.length > 0 ? (
                      taggedUsers.map((u) => (
                        <span
                          key={u.id}
                          className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[11px] truncate max-w-[8rem]"
                        >
                          {u.display_name}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-gray-400 italic">No tags</span>
                    )}
                  </div>
                  <button
                    onClick={() => openEdit(ad)}
                    className="p-1.5 text-gray-400 hover:text-blue-500 flex-shrink-0"
                    aria-label="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(ad)}
                    className="p-1.5 text-gray-400 hover:text-red-500 flex-shrink-0"
                    aria-label="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Ad"
        message="Delete this banner ad? The image will also be removed from storage."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
