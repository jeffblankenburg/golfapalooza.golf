"use client";

import { useState, useEffect, useCallback } from "react";
import { RichTextEditor } from "./RichTextEditor";

interface UserWithBio {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: {
    id: string;
    user_id: string;
    content: string;
    updated_at: string;
  } | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

type EditorMode = "list" | "edit";

export function BioManager() {
  const [users, setUsers] = useState<UserWithBio[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<EditorMode>("list");

  // Editor state
  const [editUser, setEditUser] = useState<UserWithBio | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/bios");
    const data = await res.json();
    setUsers(data.users || []);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]);

  const openEdit = (user: UserWithBio) => {
    setEditUser(user);
    setContent(user.bio?.content || "");
    setMode("edit");
  };

  const resetEditor = () => {
    setEditUser(null);
    setContent("");
    setMode("list");
  };

  const handleSave = async () => {
    if (!editUser) return;
    setSaving(true);

    await fetch("/api/admin/bios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: editUser.id,
        content,
      }),
    });

    setSaving(false);
    resetEditor();
    await fetchUsers();
  };

  const handleDelete = async () => {
    if (!editUser?.bio) return;
    setSaving(true);

    await fetch("/api/admin/bios", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: editUser.id }),
    });

    setSaving(false);
    resetEditor();
    await fetchUsers();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Editor View ──
  if (mode === "edit" && editUser) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={resetEditor} className="text-sm text-green-700 font-medium">
            &larr; Back to list
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center">
              {editUser.avatar_url ? (
                <img src={editUser.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold">{getInitials(editUser.display_name)}</span>
              )}
            </div>
            <span className="text-sm font-semibold text-gray-900">{editUser.display_name}</span>
          </div>
        </div>

        {/* Content Editor */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 block">
            Biography
          </label>
          <RichTextEditor content={content} onChange={setContent} />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl active:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Bio"}
          </button>
          {editUser.bio && (
            <button
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-xl active:bg-red-100 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── List View ──
  const withBio = users.filter((u) => u.bio);
  const withoutBio = users.filter((u) => !u.bio);

  return (
    <div className="space-y-4">
      {withBio.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            With Bio ({withBio.length})
          </h3>
          <div className="space-y-1">
            {withBio.map((user) => (
              <UserRow key={user.id} user={user} onEdit={openEdit} />
            ))}
          </div>
        </div>
      )}

      {withoutBio.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            No Bio ({withoutBio.length})
          </h3>
          <div className="space-y-1">
            {withoutBio.map((user) => (
              <UserRow key={user.id} user={user} onEdit={openEdit} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserRow({ user, onEdit }: { user: UserWithBio; onEdit: (u: UserWithBio) => void }) {
  return (
    <button
      onClick={() => onEdit(user)}
      className="w-full flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-gray-200 active:bg-gray-50 transition-colors text-left"
    >
      <div className="w-10 h-10 rounded-full overflow-hidden bg-green-700 text-white flex items-center justify-center flex-shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-bold">{getInitials(user.display_name)}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{user.display_name}</p>
        {user.bio ? (
          <p className="text-xs text-gray-500 truncate">
            Updated {new Date(user.bio.updated_at).toLocaleDateString()}
          </p>
        ) : (
          <p className="text-xs text-gray-400 italic">No bio yet</p>
        )}
      </div>
      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
