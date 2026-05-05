"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

interface Category {
  id: string;
  name: string;
  sort_order: number;
  is_system: boolean;
}

interface Note {
  id: string;
  trip_id: string;
  category_id: string;
  title: string;
  content: string;
  sort_order: number;
  pinned_to: string | null;
  category?: { id: string; name: string; sort_order: number } | null;
}

// Grouped by section for easier scanning in the dropdown. The `value` strings
// must match exactly what each target page passes as `pinnedTo` on its
// PinnedNoteButton — adding a value here without a matching placement is a
// no-op; placing a button with a value not listed here works at render time
// but admins won't have a way to pin a note to it.
const PINNED_OPTIONS = [
  { value: "", label: "None" },

  // Contests & competitions
  { value: "kgb_cup", label: "KGB Cup" },
  { value: "scramble", label: "Scrambles" },
  { value: "bspitw", label: "BSPITW" },
  { value: "skins", label: "Skins" },
  { value: "hundred_feet", label: "100 Feet" },
  { value: "calcutta", label: "Calcutta" },
  { value: "cornhole", label: "Cornhole" },
  { value: "pickem", label: "Pick'em" },
  { value: "daily_games", label: "Daily Games" },
  { value: "best_line", label: "Best Line" },

  // Scoring & rounds
  { value: "scoring", label: "Live Scoring" },
  { value: "my_rounds", label: "My Rounds" },
  { value: "course", label: "Course" },

  // Logistics
  { value: "schedule", label: "Schedule / Tee Times" },
  { value: "rooms", label: "Rooms" },
  { value: "financials", label: "Financials" },
  { value: "options", label: "Options" },
  { value: "nominations", label: "Nominations" },
  { value: "action_items", label: "Action Items" },
  { value: "info", label: "Trip Info" },

  // Content & social
  { value: "articles", label: "Articles" },
  { value: "gallery", label: "Photo Gallery" },
  { value: "chat", label: "Chat" },
  { value: "music", label: "Music" },
];

export function NotebookManager({ tripId }: { tripId: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Category form
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");

  // Note form
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [showNoteFormForCategory, setShowNoteFormForCategory] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteCategoryId, setNoteCategoryId] = useState("");
  const [notePinnedTo, setNotePinnedTo] = useState("");

  // Drag-to-reorder state
  const [dragNoteId, setDragNoteId] = useState<string | null>(null);
  const [dragOverNoteId, setDragOverNoteId] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchData = useCallback(async () => {
    const [catRes, noteRes] = await Promise.all([
      fetch(`/api/admin/notebook/categories?trip_id=${tripId}`),
      fetch(`/api/admin/notebook/notes?trip_id=${tripId}`),
    ]);
    const catData = await catRes.json();
    const noteData = await noteRes.json();
    setCategories(catData.categories || []);
    setNotes(noteData.notes || []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Category CRUD ──

  const saveCategory = async () => {
    if (!categoryName.trim()) return;
    setSaving("category");

    if (editingCategoryId) {
      await fetch("/api/admin/notebook/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCategoryId, name: categoryName.trim() }),
      });
    } else {
      await fetch("/api/admin/notebook/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, name: categoryName.trim() }),
      });
    }

    setCategoryName("");
    setEditingCategoryId(null);
    setShowCategoryForm(false);
    await fetchData();
    setSaving(null);
  };

  const startEditCategory = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setCategoryName(cat.name);
    setShowCategoryForm(true);
  };

  const deleteCategory = (cat: Category) => {
    const noteCount = notes.filter((n) => n.category_id === cat.id).length;
    setConfirmModal({
      title: "Delete Category",
      message: noteCount > 0
        ? `Delete "${cat.name}" and its ${noteCount} note${noteCount === 1 ? "" : "s"}? This cannot be undone.`
        : `Delete "${cat.name}"?`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/notebook/categories", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: cat.id }),
        });
        await fetchData();
      },
    });
  };

  // ── Note CRUD ──

  const resetNoteForm = () => {
    setNoteTitle("");
    setNoteContent("");
    setNoteCategoryId("");
    setNotePinnedTo("");
    setEditingNoteId(null);
    setShowNoteFormForCategory(null);
  };

  const startNewNote = (categoryId: string) => {
    resetNoteForm();
    setNoteCategoryId(categoryId);
    setShowNoteFormForCategory(categoryId);
  };

  const startEditNote = (note: Note) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteCategoryId(note.category_id);
    setNotePinnedTo(note.pinned_to || "");
    setShowNoteFormForCategory(note.category_id);
  };

  const saveNote = async () => {
    if (!noteTitle.trim() || !noteCategoryId) return;
    setSaving("note");

    if (editingNoteId) {
      await fetch("/api/admin/notebook/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingNoteId,
          category_id: noteCategoryId,
          title: noteTitle.trim(),
          content: noteContent,
          pinned_to: notePinnedTo || null,
        }),
      });
    } else {
      await fetch("/api/admin/notebook/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          category_id: noteCategoryId,
          title: noteTitle.trim(),
          content: noteContent,
          pinned_to: notePinnedTo || null,
        }),
      });
    }

    resetNoteForm();
    await fetchData();
    setSaving(null);
  };

  const deleteNote = (note: Note) => {
    setConfirmModal({
      title: "Delete Note",
      message: `Delete "${note.title}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/notebook/notes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: note.id }),
        });
        await fetchData();
      },
    });
  };

  // ── Drag-to-reorder ──

  const handleDrop = async (targetNoteId: string, categoryId: string) => {
    if (!dragNoteId || dragNoteId === targetNoteId) {
      setDragNoteId(null);
      setDragOverNoteId(null);
      return;
    }

    const catNotes = notes
      .filter((n) => n.category_id === categoryId)
      .sort((a, b) => a.sort_order - b.sort_order);

    const fromIndex = catNotes.findIndex((n) => n.id === dragNoteId);
    const toIndex = catNotes.findIndex((n) => n.id === targetNoteId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...catNotes];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    // Optimistic update
    const updatedNotes = notes.map((n) => {
      const idx = reordered.findIndex((r) => r.id === n.id);
      return idx !== -1 ? { ...n, sort_order: idx } : n;
    });
    setNotes(updatedNotes);
    setDragNoteId(null);
    setDragOverNoteId(null);

    // Persist
    await Promise.all(
      reordered.map((n, i) =>
        fetch("/api/admin/notebook/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: n.id, sort_order: i }),
        })
      )
    );
  };

  // ── Render ──

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isEditingNote = editingNoteId || showNoteFormForCategory;

  const getPinnedLabel = (pinnedTo: string) =>
    PINNED_OPTIONS.find((o) => o.value === pinnedTo)?.label || pinnedTo;

  // Note editor form
  if (isEditingNote) {
    return (
      <div className="space-y-4">
        <button
          onClick={resetNoteForm}
          className="flex items-center gap-1 text-green-700 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h3 className="text-sm font-semibold text-gray-900">
          {editingNoteId ? "Edit Note" : "New Note"}
        </h3>

        {/* Title */}
        <input
          type="text"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          placeholder="Note title"
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        <select
          value={noteCategoryId}
          onChange={(e) => setNoteCategoryId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Select category...</option>
          {categories.filter((c) => !c.is_system).map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        <select
          value={notePinnedTo}
          onChange={(e) => setNotePinnedTo(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          {PINNED_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}{opt.value ? ` (pinned)` : ""}</option>
          ))}
        </select>

        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
            Content
          </label>
          <RichTextEditor content={noteContent} onChange={setNoteContent} />
        </div>

        {/* Save / Cancel */}
        <div className="flex gap-2">
          <button
            onClick={saveNote}
            disabled={!noteTitle.trim() || !noteCategoryId || saving === "note"}
            className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
          >
            {saving === "note" ? "Saving..." : editingNoteId ? "Update Note" : "Create Note"}
          </button>
          <button
            onClick={resetNoteForm}
            className="px-4 py-2.5 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Main view: categories with notes
  return (
    <div className="space-y-4">
      {categories.filter((c) => !c.is_system).length === 0 && (
        <p className="text-sm text-gray-500 text-center py-4">No categories yet. Add one to get started.</p>
      )}

      {categories.filter((c) => !c.is_system).map((cat) => {
        const catNotes = notes
          .filter((n) => n.category_id === cat.id)
          .sort((a, b) => a.sort_order - b.sort_order);

        return (
          <div key={cat.id} className="border border-gray-200 rounded-xl overflow-hidden">
            {/* Category header */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{cat.name}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEditCategory(cat)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => deleteCategory(cat)}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Notes list */}
            <div className="divide-y divide-gray-100">
              {catNotes.map((note) => (
                <div
                  key={note.id}
                  draggable
                  onDragStart={() => setDragNoteId(note.id)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverNoteId(note.id); }}
                  onDragLeave={() => { if (dragOverNoteId === note.id) setDragOverNoteId(null); }}
                  onDrop={() => handleDrop(note.id, cat.id)}
                  onDragEnd={() => { setDragNoteId(null); setDragOverNoteId(null); }}
                  className={`px-4 py-2.5 flex items-center justify-between transition-colors ${
                    dragOverNoteId === note.id && dragNoteId !== note.id ? "bg-green-50" : ""
                  } ${dragNoteId === note.id ? "opacity-40" : ""}`}
                >
                  {/* Drag handle */}
                  <div className="flex-shrink-0 mr-2 cursor-grab active:cursor-grabbing text-gray-300 touch-none">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-900">{note.title}</span>
                    {note.pinned_to && (
                      <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-medium rounded">
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {getPinnedLabel(note.pinned_to)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      onClick={() => startEditNote(note)}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteNote(note)}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {catNotes.length === 0 && (
                <p className="px-4 py-3 text-xs text-gray-400 italic">No notes in this category</p>
              )}
            </div>

            {/* Add note button */}
            <button
              onClick={() => startNewNote(cat.id)}
              className="w-full px-4 py-2 text-xs text-green-700 font-medium border-t border-gray-100 hover:bg-gray-50"
            >
              + Add Note
            </button>
          </div>
        );
      })}

      {/* Category form */}
      {showCategoryForm ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="Category name"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") saveCategory(); if (e.key === "Escape") { setShowCategoryForm(false); setEditingCategoryId(null); setCategoryName(""); } }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <button
            onClick={saveCategory}
            disabled={!categoryName.trim() || saving === "category"}
            className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl disabled:opacity-50"
          >
            {saving === "category" ? "..." : editingCategoryId ? "Update" : "Add"}
          </button>
          <button
            onClick={() => { setShowCategoryForm(false); setEditingCategoryId(null); setCategoryName(""); }}
            className="px-3 py-2 text-sm text-gray-500"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setCategoryName(""); setEditingCategoryId(null); setShowCategoryForm(true); }}
          className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 active:bg-gray-50"
        >
          + Add Category
        </button>
      )}

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
