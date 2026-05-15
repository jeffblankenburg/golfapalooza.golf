"use client";

import { useState } from "react";
import { DragHandle } from "@/components/DragHandle";

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

export function TagPicker({
  itemId,
  allUsers,
  existingTags = [],
  onClose,
  onTagsChanged,
}: {
  itemId: string;
  allUsers: GalleryUser[];
  existingTags?: string[];
  onClose: () => void;
  onTagsChanged?: (taggedIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(existingTags)
  );
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search
    ? allUsers.filter((u) =>
        u.display_name.toLowerCase().includes(search.toLowerCase())
      )
    : allUsers;

  const toggleUser = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);

    // Determine new tags to add vs tags to remove
    const newTags = [...selected].filter((id) => !existingTags.includes(id));
    const removedTags = existingTags.filter((id) => !selected.has(id));

    // Add new tags
    if (newTags.length > 0) {
      await fetch(`/api/gallery/${itemId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: newTags }),
      });
    }

    // Remove old tags
    for (const userId of removedTags) {
      await fetch(`/api/gallery/${itemId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    }

    onTagsChanged?.([...selected]);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl animate-slide-up max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <DragHandle onClose={onClose} className="" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3">
          <h2 className="text-lg font-bold text-gray-900">Tag Loozers</h2>
          <button
            onClick={onClose}
            className="text-gray-500 text-sm font-medium"
          >
            Skip
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            autoFocus
            className="w-full px-3 py-2 text-[16px] border border-gray-300 rounded-lg focus:border-green-600 focus:ring-1 focus:ring-green-600 outline-none"
          />
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto px-4">
          {filtered.map((user) => (
            <button
              key={user.id}
              onClick={() => toggleUser(user.id)}
              className="flex items-center gap-3 w-full py-2.5 border-b border-gray-100"
            >
              {/* Checkbox */}
              <div
                className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                  selected.has(user.id)
                    ? "bg-green-600 border-green-600"
                    : "border-gray-300"
                }`}
              >
                {selected.has(user.id) && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-green-700 text-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] font-semibold">
                    {getInitials(user.display_name)}
                  </span>
                )}
              </div>

              {/* Name */}
              <span className="text-sm font-medium text-gray-900">
                {user.display_name}
              </span>
            </button>
          ))}
        </div>

        {/* Save button */}
        <div className="px-4 pt-4 pb-24 border-t border-gray-200">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl disabled:opacity-50 active:scale-95 transition-transform"
          >
            {saving
              ? "Saving..."
              : selected.size > 0
              ? `Tag ${selected.size} Loozer${selected.size !== 1 ? "s" : ""}`
              : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
