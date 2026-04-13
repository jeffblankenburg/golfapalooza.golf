"use client";

import { useState, useEffect } from "react";
import type { ChatMember } from "./ChatRoom";

export function ChatRoomSettings({
  roomId,
  roomName,
  currentUserId,
  currentUserRole,
  members,
  onClose,
  onRename,
  onMembersChanged,
  onLeft,
}: {
  roomId: string;
  roomName: string;
  currentUserId: string;
  currentUserRole: string;
  members: ChatMember[];
  onClose: () => void;
  onRename: (name: string) => void;
  onMembersChanged: (members: ChatMember[]) => void;
  onLeft: () => void;
}) {
  const [name, setName] = useState(roomName);
  const [saving, setSaving] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [allUsers, setAllUsers] = useState<ChatMember[]>([]);
  const [addSearch, setAddSearch] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isCreator = currentUserRole === "creator";
  const nameChanged = name.trim() !== roomName && name.trim().length > 0;

  useEffect(() => {
    if (showAddMembers && allUsers.length === 0) {
      fetch("/api/admin/users")
        .then((res) => res.json())
        .then((data) => {
          const users = (data.users || []).map((u: { id: string; display_name: string; avatar_url: string | null }) => ({
            id: u.id,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            role: "member",
          }));
          setAllUsers(users);
        })
        .catch(() => {});
    }
  }, [showAddMembers, allUsers.length]);

  const handleSaveName = async () => {
    if (!nameChanged) return;
    setSaving(true);
    const res = await fetch(`/api/chat/rooms/${roomId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      onRename(name.trim());
    }
    setSaving(false);
  };

  const handleAddMember = async (userId: string) => {
    const res = await fetch(`/api/chat/rooms/${roomId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [userId] }),
    });
    if (res.ok) {
      const data = await res.json();
      const newMembers = (data.members || []).map((m: { user_id: string; role: string; user: { id: string; display_name: string; avatar_url: string | null } | null }) => ({
        id: m.user?.id || m.user_id,
        display_name: m.user?.display_name || "Unknown",
        avatar_url: m.user?.avatar_url || null,
        role: m.role,
      }));
      onMembersChanged(newMembers);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    const res = await fetch(`/api/chat/rooms/${roomId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      onMembersChanged(members.filter((m) => m.id !== userId));
    }
  };

  const handleLeave = async () => {
    await fetch(`/api/chat/rooms/${roomId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "leave" }),
    });
    onLeft();
  };

  const memberIds = new Set(members.map((m) => m.id));
  const addableUsers = allUsers.filter(
    (u) =>
      !memberIds.has(u.id) &&
      u.display_name.toLowerCase().includes(addSearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[85vh] flex flex-col animate-slide-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2">
          <h2 className="text-lg font-semibold">Group Settings</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
          {/* Rename section */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Group Name
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter group name"
                maxLength={50}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
              />
              {nameChanged && (
                <button
                  onClick={handleSaveName}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-50"
                >
                  {saving ? "..." : "Save"}
                </button>
              )}
            </div>
          </div>

          {/* Members section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Members ({members.length})
              </span>
              <button
                onClick={() => setShowAddMembers(!showAddMembers)}
                className="text-sm font-medium text-green-600 active:text-green-700"
              >
                {showAddMembers ? "Done" : "Add"}
              </button>
            </div>

            {/* Add members search */}
            {showAddMembers && (
              <div className="mb-3">
                <input
                  type="text"
                  value={addSearch}
                  onChange={(e) => setAddSearch(e.target.value)}
                  placeholder="Search Loozers to add..."
                  autoFocus
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
                <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-100">
                  {addableUsers.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-3">
                      {allUsers.length === 0 ? "Loading..." : "No users to add"}
                    </p>
                  ) : (
                    addableUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleAddMember(u.id)}
                        className="flex items-center gap-3 w-full px-3 py-2 text-left active:bg-gray-50 border-b border-gray-50 last:border-b-0"
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-xs font-semibold text-gray-500">
                              {u.display_name?.[0]?.toUpperCase() || "?"}
                            </span>
                          </div>
                        )}
                        <span className="text-sm text-gray-900">{u.display_name}</span>
                        <svg className="w-4 h-4 text-green-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Member list */}
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-b-0"
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-sm font-semibold text-gray-500">
                        {m.display_name?.[0]?.toUpperCase() || "?"}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 truncate block">
                      {m.display_name}
                      {m.id === currentUserId && (
                        <span className="text-gray-400 font-normal"> (you)</span>
                      )}
                    </span>
                    {m.role === "creator" && (
                      <span className="text-[11px] text-green-600 font-medium">Creator</span>
                    )}
                  </div>
                  {isCreator && m.id !== currentUserId && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      className="text-gray-400 hover:text-red-500 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Leave button */}
          <div>
            {!confirmLeave ? (
              <button
                onClick={() => setConfirmLeave(true)}
                className="w-full py-3 rounded-xl text-red-600 text-sm font-semibold border border-red-200 active:bg-red-50"
              >
                Leave Group
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-600 text-center">
                  Are you sure? You won&apos;t receive new messages.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleLeave}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold active:opacity-80"
                  >
                    Leave
                  </button>
                  <button
                    onClick={() => setConfirmLeave(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold active:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
