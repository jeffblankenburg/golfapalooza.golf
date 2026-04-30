"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AwardBadge } from "@/components/AwardBadge";

interface Category {
  category: string;
  title: string;
  short_label: string;
  icon: string;
  icon_url: string | null;
  description: string | null;
  sort_order: number;
  updated_at: string;
  accolade_count?: number;
}


export function AccoladeCategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<Category>>>({});
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newDraft, setNewDraft] = useState<Partial<Category>>({
    title: "",
    short_label: "",
    icon: "🏵️",
    description: "",
    sort_order: 50,
  });
  const [creating, setCreating] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/accolades/categories");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? `HTTP ${res.status}`);
        } else {
          setCategories(data.categories ?? []);
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setDraft = (cat: string, patch: Partial<Category>) => {
    setDrafts((prev) => ({ ...prev, [cat]: { ...(prev[cat] ?? {}), ...patch } }));
  };

  const isDirty = (cat: string) => {
    const d = drafts[cat];
    if (!d) return false;
    const orig = categories.find((c) => c.category === cat);
    if (!orig) return false;
    for (const k of Object.keys(d) as (keyof Category)[]) {
      if (d[k] !== orig[k]) return true;
    }
    return false;
  };

  const save = async (cat: string) => {
    const draft = drafts[cat];
    if (!draft) return;
    setSavingFor(cat);
    const res = await fetch(`/api/admin/accolades/categories/${cat}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(`Save failed: ${data.error ?? res.status}`);
      setSavingFor(null);
      return;
    }
    setCategories((prev) =>
      prev
        .map((c) => (c.category === cat ? { ...c, ...data.category } : c))
        .sort((a, b) => a.sort_order - b.sort_order),
    );
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[cat];
      return next;
    });
    setSavingFor(null);
  };

  const createCategory = async () => {
    if (!newDraft.title?.trim()) {
      alert("Title is required");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/accolades/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newDraft),
    });
    const data = await res.json();
    setCreating(false);
    if (!res.ok) {
      alert(`Create failed: ${data.error ?? res.status}`);
      return;
    }
    setCategories((prev) =>
      [...prev, data.category].sort((a, b) => a.sort_order - b.sort_order),
    );
    setNewDraft({ title: "", short_label: "", icon: "🏵️", description: "", sort_order: 50 });
    setShowNew(false);
  };

  const uploadBadge = async (cat: string, file: File) => {
    setUploadingFor(cat);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/admin/accolades/categories/${cat}/badge`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    setUploadingFor(null);
    if (!res.ok) {
      alert(`Upload failed: ${data.error ?? res.status}`);
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.category === cat ? { ...c, ...data.category } : c)),
    );
  };

  const removeBadge = async (cat: string) => {
    if (!confirm("Remove the badge image and revert to the emoji icon?")) return;
    setUploadingFor(cat);
    const res = await fetch(`/api/admin/accolades/categories/${cat}/badge`, {
      method: "DELETE",
    });
    const data = await res.json();
    setUploadingFor(null);
    if (!res.ok) {
      alert(`Failed: ${data.error ?? res.status}`);
      return;
    }
    setCategories((prev) =>
      prev.map((c) => (c.category === cat ? { ...c, ...data.category } : c)),
    );
  };

  const deleteCategory = async (cat: string, title: string) => {
    if (!confirm(`Delete the "${title}" award? This fails if any winners are assigned.`)) return;
    const res = await fetch(`/api/admin/accolades/categories/${cat}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      alert(`Delete failed: ${data.error ?? res.status}`);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.category !== cat));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* New award */}
      {showNew ? (
        <div className="bg-white rounded-2xl border-2 border-green-300 shadow-sm p-4 space-y-2">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
            New award
          </p>
          <div className="grid grid-cols-[3rem_1fr] gap-2 items-center">
            <input
              value={newDraft.icon ?? ""}
              onChange={(e) => setNewDraft({ ...newDraft, icon: e.target.value })}
              placeholder="🏵️"
              className="text-2xl text-center border border-gray-300 rounded-lg py-2"
            />
            <input
              value={newDraft.title ?? ""}
              onChange={(e) => setNewDraft({ ...newDraft, title: e.target.value })}
              placeholder="Display title (e.g. Best Line)"
              autoFocus
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"
            />
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <input
              value={newDraft.short_label ?? ""}
              onChange={(e) => setNewDraft({ ...newDraft, short_label: e.target.value })}
              placeholder="Short label (e.g. Line)"
              className="border border-gray-300 rounded-lg px-3 py-2 text-xs uppercase tracking-wide"
            />
            <input
              type="number"
              value={newDraft.sort_order ?? 50}
              onChange={(e) =>
                setNewDraft({ ...newDraft, sort_order: parseInt(e.target.value, 10) || 0 })
              }
              className="border border-gray-300 rounded-lg px-2 py-2 text-xs text-center"
            />
          </div>
          <textarea
            value={newDraft.description ?? ""}
            onChange={(e) => setNewDraft({ ...newDraft, description: e.target.value })}
            placeholder="Description (e.g. Voted on by founding fathers)"
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowNew(false)}
              className="px-3 py-1.5 text-xs text-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={createCategory}
              disabled={creating || !newDraft.title?.trim()}
              className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform"
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowNew(true)}
          className="w-full bg-white border-2 border-dashed border-gray-300 rounded-2xl p-3 text-sm text-gray-500 font-medium active:bg-gray-50"
        >
          + New award
        </button>
      )}

      {categories.map((c) => {
        const d = drafts[c.category] ?? {};
        const dirty = isDirty(c.category);
        const saving = savingFor === c.category;
        const v = (k: keyof Category) =>
          (d[k] !== undefined ? d[k] : c[k]) as string | number;
        const winnerCount = c.accolade_count ?? 0;
        const canDelete = winnerCount === 0;
        return (
          <div
            key={c.category}
            className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-2"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-mono text-gray-400">{c.category}</p>
              <p className="text-[10px] text-gray-400">
                {winnerCount} winner{winnerCount === 1 ? "" : "s"} · updated{" "}
                {new Date(c.updated_at).toLocaleDateString()}
              </p>
            </div>
            <div className="grid grid-cols-[3rem_1fr] gap-2 items-center">
              <div className="relative flex items-center justify-center border border-gray-300 rounded-lg py-2 bg-gray-50">
                <AwardBadge iconUrl={c.icon_url} emoji={c.icon} alt={c.title} size="md" />
              </div>
              <input
                value={String(v("title") ?? "")}
                onChange={(e) => setDraft(c.category, { title: e.target.value })}
                placeholder="Display title"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={String(v("icon") ?? "")}
                onChange={(e) => setDraft(c.category, { icon: e.target.value })}
                placeholder="🏆"
                className="w-16 text-center text-2xl border border-gray-300 rounded-lg py-1.5"
                title="Emoji fallback (used when no badge image is uploaded)"
              />
              <input
                ref={(el) => {
                  fileInputs.current[c.category] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadBadge(c.category, file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputs.current[c.category]?.click()}
                disabled={uploadingFor === c.category}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 disabled:opacity-50"
              >
                {uploadingFor === c.category
                  ? "Uploading…"
                  : c.icon_url
                    ? "Replace badge"
                    : "Upload badge image"}
              </button>
              {c.icon_url && (
                <button
                  onClick={() => removeBadge(c.category)}
                  disabled={uploadingFor === c.category}
                  className="text-xs px-2 py-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <input
                value={String(v("short_label") ?? "")}
                onChange={(e) => setDraft(c.category, { short_label: e.target.value })}
                placeholder="Short label"
                className="border border-gray-300 rounded-lg px-3 py-2 text-xs uppercase tracking-wide"
              />
              <input
                type="number"
                value={Number(v("sort_order") ?? 0)}
                onChange={(e) =>
                  setDraft(c.category, { sort_order: parseInt(e.target.value, 10) || 0 })
                }
                placeholder="Order"
                className="border border-gray-300 rounded-lg px-2 py-2 text-xs text-center"
              />
            </div>
            <textarea
              value={String(v("description") ?? "")}
              onChange={(e) => setDraft(c.category, { description: e.target.value })}
              placeholder="Description (tooltip)"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs"
            />
            <div className="flex justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <Link
                  href={`/admin/accolades/${c.category}`}
                  className="text-xs font-medium text-green-700 hover:underline"
                >
                  Manage winners →
                </Link>
                <button
                  onClick={() => deleteCategory(c.category, c.title)}
                  disabled={!canDelete}
                  title={canDelete ? "Delete this award" : "Award has winners — remove them first"}
                  className="text-xs text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
              <button
                onClick={() => save(c.category)}
                disabled={!dirty || saving}
                className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform"
              >
                {saving ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
