"use client";

import { useState, useEffect, useCallback } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { BTN_BACK } from "@/lib/ui/buttons";

interface UserWithBio {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: {
    id: string;
    user_id: string;
    content: string;
    is_visible: boolean;
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
  const [isVisible, setIsVisible] = useState(true);
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
    setIsVisible(user.bio?.is_visible ?? true);
    setMode("edit");
  };

  const resetEditor = () => {
    setEditUser(null);
    setContent("");
    setIsVisible(true);
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

  const setBioVisibility = async (userId: string, next: boolean) => {
    const prevUsers = users;
    // Optimistic update — list row + editor (if open on this user).
    setUsers((curr) =>
      curr.map((u) =>
        u.id === userId && u.bio ? { ...u, bio: { ...u.bio, is_visible: next } } : u
      )
    );
    if (editUser?.id === userId) setIsVisible(next);

    const res = await fetch("/api/admin/bios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, is_visible: next }),
    });

    if (!res.ok) {
      setUsers(prevUsers);
      if (editUser?.id === userId) setIsVisible(!next);
    }
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
          <button onClick={resetEditor} className={BTN_BACK}>
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

        {/* Visibility Toggle */}
        <label className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white rounded-xl border border-gray-200 cursor-pointer">
          <div>
            <p className="text-sm font-semibold text-gray-900">Visible on profile</p>
            <p className="text-xs text-gray-500">
              {isVisible
                ? "Bio appears on this Loozer's profile when it has content."
                : "Bio is hidden from everyone — only admins can see it here."}
            </p>
          </div>
          <VisibilityToggle
            isVisible={isVisible}
            onToggle={() => setBioVisibility(editUser.id, !isVisible)}
          />
        </label>

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
  return (
    <div className="space-y-1">
      {users.map((user) => (
        <UserRow
          key={user.id}
          user={user}
          onEdit={openEdit}
          onToggleVisibility={(next) => setBioVisibility(user.id, next)}
        />
      ))}
    </div>
  );
}

function VisibilityToggle({
  isVisible,
  onToggle,
}: {
  isVisible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isVisible}
      aria-label={isVisible ? "Hide bio" : "Show bio"}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        isVisible ? "bg-green-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          isVisible ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function UserRow({
  user,
  onEdit,
  onToggleVisibility,
}: {
  user: UserWithBio;
  onEdit: (u: UserWithBio) => void;
  onToggleVisibility: (next: boolean) => void;
}) {
  const hasContent =
    !!user.bio && !!user.bio.content && user.bio.content.trim().length > 0;

  return (
    <div className="w-full flex items-center gap-3 px-3 py-2.5 bg-white rounded-xl border border-gray-200">
      <button
        type="button"
        onClick={() => onEdit(user)}
        className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-60"
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
          {hasContent ? (
            <p className="text-xs text-gray-500 truncate">
              Updated {new Date(user.bio!.updated_at).toLocaleDateString()}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic">No bio yet</p>
          )}
        </div>
      </button>
      {hasContent && (
        <VisibilityToggle
          isVisible={user.bio!.is_visible}
          onToggle={() => onToggleVisibility(!user.bio!.is_visible)}
        />
      )}
      <button
        type="button"
        onClick={() => onEdit(user)}
        aria-label={`Edit ${user.display_name}'s bio`}
        className="flex-shrink-0 p-1 text-gray-400 active:opacity-60"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
