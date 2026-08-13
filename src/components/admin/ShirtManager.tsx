"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { DragHandle } from "@/components/DragHandle";

interface Shirt {
  id: string;
  day_label: string;
  name: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
}

type Draft = {
  id: string | null;
  day_label: string;
  name: string;
  description: string;
  image_url: string | null;
};

const EMPTY_DRAFT: Draft = { id: null, day_label: "", name: "", description: "", image_url: null };

export function ShirtManager({ tripId }: { tripId: string }) {
  const [shirts, setShirts] = useState<Shirt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Shirt | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/shirts?trip_id=${tripId}`);
    const data = await res.json();
    if (res.ok) setShirts(data.shirts || []);
  }, [tripId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const save = async () => {
    if (!editing) return;
    if (!editing.day_label.trim() || !editing.name.trim()) {
      setError("Day and shirt name are required.");
      return;
    }
    setSaving(true);
    setError(null);

    const method = editing.id ? "PUT" : "POST";
    const body = editing.id
      ? {
          id: editing.id,
          day_label: editing.day_label,
          name: editing.name,
          description: editing.description,
          image_url: editing.image_url,
        }
      : {
          trip_id: tripId,
          day_label: editing.day_label,
          name: editing.name,
          description: editing.description,
          image_url: editing.image_url,
        };

    const res = await fetch("/api/admin/shirts", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Failed to save shirt.");
      return;
    }
    setEditing(null);
    await load();
  };

  const remove = async (shirt: Shirt) => {
    setConfirmDelete(null);
    setShirts((prev) => prev.filter((s) => s.id !== shirt.id)); // optimistic
    const res = await fetch("/api/admin/shirts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: shirt.id }),
    });
    if (!res.ok) await load(); // revert to server truth on failure
  };

  // Swap this shirt with its neighbor in the flat ordered list.
  const move = async (index: number, dir: -1 | 1) => {
    const other = index + dir;
    if (other < 0 || other >= shirts.length) return;
    const a = shirts[index];
    const b = shirts[other];
    const reordered = [...shirts];
    reordered[index] = b;
    reordered[other] = a;
    setShirts(reordered); // optimistic
    await Promise.all([
      fetch("/api/admin/shirts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id, sort_order: b.sort_order }),
      }),
      fetch("/api/admin/shirts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id, sort_order: a.sort_order }),
      }),
    ]);
    await load();
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/shirts/upload-image", { method: "POST", body: fd });
    setUploading(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error || "Upload failed.");
      return;
    }
    setEditing((prev) => (prev ? { ...prev, image_url: d.url } : prev));
  };

  if (loading) {
    return <p className="text-gray-400 text-center py-8">Loading…</p>;
  }

  return (
    <div>
      <button
        onClick={() => {
          setError(null);
          // Prefill the day with the most recent one to speed up multi-add.
          setEditing({ ...EMPTY_DRAFT, day_label: shirts[shirts.length - 1]?.day_label || "" });
        }}
        className="w-full mb-4 py-3 bg-green-600 text-white font-semibold rounded-xl active:scale-95 transition-transform"
      >
        + Add Shirt
      </button>

      {shirts.length === 0 ? (
        <p className="text-gray-400 text-center py-8">
          No shirts yet. Add the first one to build this event&rsquo;s guide.
        </p>
      ) : (
        <div className="space-y-2">
          {shirts.map((shirt, i) => {
            const isDayStart = i === 0 || shirts[i - 1].day_label !== shirt.day_label;
            return (
              <div key={shirt.id}>
                {isDayStart && (
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-1">
                    {shirt.day_label}
                  </p>
                )}
                <div className="flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-xl">
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {shirt.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={shirt.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{shirt.name}</p>
                    {shirt.description && (
                      <p className="text-xs text-gray-500 truncate">{shirt.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="p-1 text-gray-400 disabled:opacity-30 active:text-gray-700"
                      aria-label="Move up"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === shirts.length - 1}
                      className="p-1 text-gray-400 disabled:opacity-30 active:text-gray-700"
                      aria-label="Move down"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing({
                        id: shirt.id,
                        day_label: shirt.day_label,
                        name: shirt.name,
                        description: shirt.description || "",
                        image_url: shirt.image_url,
                      });
                    }}
                    className="p-2 text-gray-400 active:text-green-600"
                    aria-label="Edit"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button
                    onClick={() => setConfirmDelete(shirt)}
                    className="p-2 text-gray-400 active:text-red-600"
                    aria-label="Delete"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit editor sheet */}
      {editing && (
        <div className="fixed top-14 left-0 right-0 z-35 flex items-end justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-6 animate-slide-up max-h-full overflow-y-auto">
            <DragHandle onClose={() => setEditing(null)} className="mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editing.id ? "Edit Shirt" : "Add Shirt"}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                <input
                  type="text"
                  value={editing.day_label}
                  onChange={(e) => setEditing({ ...editing, day_label: e.target.value })}
                  placeholder="e.g. Thursday"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shirt name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Navy Polo"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="e.g. Pair with khaki shorts"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Photo</label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {editing.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={editing.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg active:bg-gray-50 disabled:opacity-50"
                    >
                      {uploading ? "Uploading…" : editing.image_url ? "Replace" : "Upload"}
                    </button>
                    {editing.image_url && (
                      <button
                        onClick={() => setEditing({ ...editing, image_url: null })}
                        className="px-3 py-1.5 text-sm font-medium text-red-600 active:bg-red-50 rounded-lg"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadPhoto(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                onClick={save}
                disabled={saving || uploading}
                className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl active:scale-95 transition-transform disabled:opacity-50"
              >
                {saving ? "Saving…" : editing.id ? "Save Changes" : "Add Shirt"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        title="Delete shirt?"
        message={confirmDelete ? `Remove "${confirmDelete.name}" from the guide? This can't be undone.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
