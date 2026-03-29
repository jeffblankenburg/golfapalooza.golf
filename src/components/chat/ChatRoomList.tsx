"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

interface RoomMember {
  user: { id: string; display_name: string; avatar_url: string | null } | null;
}

interface ChatRoom {
  id: string;
  type: "group" | "dm";
  name: string;
  members: RoomMember[];
  lastMessage: {
    content: string | null;
    image_url: string | null;
    created_at: string;
    sender: { display_name: string } | null;
  } | null;
  unreadCount: number;
}

interface User {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

function timeAgo(date: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function ChatRoomList({
  currentUserId,
  users,
}: {
  currentUserId: string;
  users: User[];
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);

  useEffect(() => {
    fetch("/api/chat/rooms")
      .then((res) => res.json())
      .then((data) => {
        setRooms(data.rooms || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Find existing rooms that match the selected users exactly
  const matchingRooms = useMemo(() => {
    if (selectedUsers.length === 0) return [];

    const selectedIds = new Set(selectedUsers.map((u) => u.id));
    const allMemberIds = new Set([currentUserId, ...selectedIds]);

    return rooms.filter((room) => {
      // Skip the main Loozers group
      if (room.type === "group" && room.name === "Loozers") return false;

      const roomMemberIds = new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (room.members as any[])
          ?.map((m) => m.user?.id)
          .filter(Boolean) || []
      );

      if (roomMemberIds.size !== allMemberIds.size) return false;
      for (const id of allMemberIds) {
        if (!roomMemberIds.has(id)) return false;
      }
      return true;
    });
  }, [selectedUsers, rooms, currentUserId]);

  // Rooms that partially match (contain all selected users but may have more members)
  const suggestedRooms = useMemo(() => {
    if (selectedUsers.length === 0) return [];

    const selectedIds = new Set(selectedUsers.map((u) => u.id));
    const allRequiredIds = new Set([currentUserId, ...selectedIds]);

    return rooms.filter((room) => {
      // Skip exact matches (shown separately) and main group
      if (room.type === "group" && room.name === "Loozers") return false;

      const roomMemberIds = new Set(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (room.members as any[])
          ?.map((m) => m.user?.id)
          .filter(Boolean) || []
      );

      // Must contain all selected users but have different total count
      if (roomMemberIds.size === allRequiredIds.size) return false;
      for (const id of allRequiredIds) {
        if (!roomMemberIds.has(id)) return false;
      }
      return true;
    });
  }, [selectedUsers, rooms, currentUserId]);

  const filteredUsers = useMemo(() => {
    const selectedIds = new Set(selectedUsers.map((u) => u.id));
    return users
      .filter((u) => !selectedIds.has(u.id))
      .filter((u) =>
        u.display_name?.toLowerCase().includes(search.toLowerCase())
      );
  }, [users, selectedUsers, search]);

  const toggleUser = (user: User) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.id === user.id);
      if (exists) return prev.filter((u) => u.id !== user.id);
      return [...prev, user];
    });
    setSearch("");
  };

  const removeUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  const startConversation = async () => {
    if (selectedUsers.length === 0 || creating) return;

    // If there's an exact match, navigate to it
    if (matchingRooms.length > 0) {
      router.push(`/chat/${matchingRooms[0].id}`);
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: selectedUsers.map((u) => u.id),
        }),
      });
      const data = await res.json();
      if (data.room?.id) {
        router.push(`/chat/${data.room.id}`);
      }
    } finally {
      setCreating(false);
      setShowCompose(false);
      setSelectedUsers([]);
    }
  };

  const openCompose = () => {
    setShowCompose(true);
    setSelectedUsers([]);
    setSearch("");
  };

  const closeCompose = () => {
    setShowCompose(false);
    setSelectedUsers([]);
    setSearch("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Pin main group chat at top
  const groupRooms = rooms.filter((r) => r.type === "group");
  const dmRooms = rooms.filter((r) => r.type === "dm");
  const sortedRooms = [...groupRooms, ...dmRooms];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <button
          onClick={openCompose}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-green-600 text-white"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      </div>

      {/* Room list */}
      {sortedRooms.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-sm">No conversations yet</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {sortedRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => router.push(`/chat/${room.id}`)}
              className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-gray-50 border-b border-gray-50"
            >
              {/* Avatar */}
              {room.type === "dm" ? (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const otherMember = (room.members as any[])?.find(
                  (m) => m.user?.id !== currentUserId
                );
                const avatarUrl = otherMember?.user?.avatar_url;
                return avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-semibold text-gray-500">
                      {room.name?.[0]?.toUpperCase() || "?"}
                    </span>
                  </div>
                );
              })() : (
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`text-[15px] truncate ${room.unreadCount > 0 ? "font-semibold text-gray-900" : "font-medium text-gray-900"}`}>
                    {room.name}
                  </span>
                  {room.lastMessage && (
                    <span className={`text-xs flex-shrink-0 ml-2 ${room.unreadCount > 0 ? "text-green-600 font-medium" : "text-gray-400"}`}>
                      {timeAgo(room.lastMessage.created_at)}
                    </span>
                  )}
                </div>
                {room.lastMessage && (
                  <p className={`text-sm truncate mt-0.5 ${room.unreadCount > 0 ? "text-gray-800 font-medium" : "text-gray-500"}`}>
                    {room.type === "group" && room.lastMessage.sender
                      ? `${room.lastMessage.sender.display_name}: `
                      : ""}
                    {room.lastMessage.content || (room.lastMessage.image_url?.includes("giphy.com") ? "Sent a GIF" : "Sent an image")}
                  </p>
                )}
              </div>

              {/* Unread badge */}
              {room.unreadCount > 0 && (
                <span className="flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-xs font-bold text-white bg-green-600 rounded-full flex-shrink-0">
                  {room.unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* New Message compose sheet */}
      {showCompose && (
        <div className="fixed left-0 right-0 top-14 bottom-16 z-30">
          <div className="absolute inset-0 bg-black/40" onClick={closeCompose} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-full flex flex-col animate-slide-up">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <h2 className="text-lg font-semibold">New Message</h2>
              <button onClick={closeCompose} className="w-8 h-8 flex items-center justify-center">
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* To: field with selected user chips */}
            <div className="flex items-center gap-2 px-4 py-2 border-y border-gray-100 flex-wrap">
              <span className="text-[15px] text-gray-400 flex-shrink-0">To:</span>
              {selectedUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => removeUser(u.id)}
                  className="flex items-center gap-1 bg-green-100 text-green-800 px-2.5 py-1 rounded-full text-[13px] font-medium active:bg-green-200"
                >
                  {u.display_name}
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ))}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={selectedUsers.length === 0 ? "Search Loozers" : "Add more..."}
                autoFocus
                className="flex-1 min-w-[80px] text-[15px] bg-transparent outline-none placeholder-gray-300"
              />
            </div>

            {/* Matching existing conversations */}
            {selectedUsers.length > 0 && (matchingRooms.length > 0 || suggestedRooms.length > 0) && (
              <div className="border-b border-gray-100">
                {matchingRooms.length > 0 && (
                  <div>
                    <p className="px-4 pt-2 pb-1 text-[11px] text-gray-400 font-medium uppercase tracking-wide">Existing Conversation</p>
                    {matchingRooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => {
                          router.push(`/chat/${room.id}`);
                          closeCompose();
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-left active:bg-gray-50"
                      >
                        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                          {room.type === "dm" ? (
                            <span className="text-sm font-semibold text-green-700">
                              {room.name?.[0]?.toUpperCase() || "?"}
                            </span>
                          ) : (
                            <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium text-gray-900 truncate">{room.name}</p>
                          <p className="text-[12px] text-green-600">Open existing conversation</p>
                        </div>
                        <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
                {suggestedRooms.length > 0 && (
                  <div>
                    <p className="px-4 pt-2 pb-1 text-[11px] text-gray-400 font-medium uppercase tracking-wide">Similar Groups</p>
                    {suggestedRooms.map((room) => (
                      <button
                        key={room.id}
                        onClick={() => {
                          router.push(`/chat/${room.id}`);
                          closeCompose();
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-left active:bg-gray-50"
                      >
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium text-gray-900 truncate">{room.name}</p>
                          <p className="text-[12px] text-gray-400">Also includes these Loozers</p>
                        </div>
                        <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* User list */}
            <div className="flex-1 overflow-y-auto">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggleUser(u)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left active:bg-gray-50 border-b border-gray-50"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-gray-500">
                        {u.display_name?.[0]?.toUpperCase() || "?"}
                      </span>
                    </div>
                  )}
                  <span className="flex-1 text-[15px] font-medium text-gray-900">{u.display_name}</span>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">No matches</p>
              )}
            </div>

            {/* Create conversation button */}
            {selectedUsers.length > 0 && matchingRooms.length === 0 && (
              <div className="px-4 py-3 border-t border-gray-100">
                <button
                  onClick={startConversation}
                  disabled={creating}
                  className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-[15px] active:bg-green-700 disabled:bg-gray-300"
                >
                  {creating
                    ? "Creating..."
                    : selectedUsers.length === 1
                      ? `Message ${selectedUsers[0].display_name}`
                      : `Create Group (${selectedUsers.length} Loozers)`
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
