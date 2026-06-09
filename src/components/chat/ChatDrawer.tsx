"use client";

import { useEffect, useState } from "react";
import { useChatDrawer } from "@/contexts/ChatDrawerContext";
import { ChatRoomList } from "./ChatRoomList";
import { ChatRoom, type ChatMember } from "./ChatRoom";

interface DmUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface RoomData {
  id: string;
  type: string;
  raw_name: string | null;
  display_name: string;
  created_by: string | null;
  member_count: number;
  current_user_id: string;
  current_user_name: string;
  current_user_role: string;
  members: ChatMember[];
}

/**
 * Universal chat drawer. Mounted once at the root layout. Two internal
 * surfaces:
 *   - Room list (when `currentRoomId === null`)
 *   - Single room (when `currentRoomId` is set) — fetches its metadata
 *     client-side via /api/chat/rooms/[roomId] so we don't depend on a
 *     full-page server render.
 *
 * Closing the drawer keeps `currentRoomId` so reopening returns to the
 * same room (matches iMessage-style behavior).
 */
export function ChatDrawer() {
  const { isOpen, currentRoomId, lastOpenedAt, closeDrawer, selectRoom, backToList } = useChatDrawer();

  // Pre-load the room list data at app start (drawer is mounted by the root
  // layout, so this effect fires once on app mount — long before the user
  // taps the chat icon). When they do open, the list is already populated.
  const [listData, setListData] = useState<{
    currentUserId: string;
    users: DmUser[];
  } | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (listData) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/users-for-dm");
        if (!res.ok) {
          // 401 on auth/spectator pages is expected and silent — drawer
          // simply never shows because no chat icon is rendered there.
          if (!cancelled && res.status !== 401) setListError("Couldn't load chat");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setListData({
          currentUserId: data.current_user_id,
          users: data.users || [],
        });
      } catch {
        if (!cancelled) setListError("Couldn't load chat");
      }
    })();
    return () => { cancelled = true; };
  }, [listData]);

  // Per-room data. Re-fetched each time we drill into a new room so members
  // and the display name reflect any roster changes since last visit.
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);

  useEffect(() => {
    // Fire as soon as a room is selected — even if the drawer is closed —
    // so the room data is hot when the user reopens. (Currently rooms only
    // become selected via tapping a list item, which requires opening the
    // drawer at least once. This still pre-loads if the user is in a room,
    // closes the drawer, and reopens.)
    if (!currentRoomId) return;
    // Already-loaded short-circuit — comparing against state is fine here
    // because both this effect and the conditional render check the same
    // `id === currentRoomId` invariant.
    if (roomData?.id === currentRoomId) return;
    let cancelled = false;
    (async () => {
      // setLoading/setError inside the async block (next microtask) so the
      // effect body itself doesn't trigger a synchronous setState cascade.
      if (cancelled) return;
      setRoomLoading(true);
      setRoomError(null);
      try {
        const res = await fetch(`/api/chat/rooms/${currentRoomId}`);
        if (!res.ok) {
          if (!cancelled) {
            setRoomError(res.status === 403 ? "Not a member of this chat" : "Couldn't load chat");
            setRoomLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setRoomData(data.room as RoomData);
        setRoomLoading(false);
      } catch {
        if (!cancelled) {
          setRoomError("Couldn't load chat");
          setRoomLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, currentRoomId, roomData?.id]);

  // Lock background scroll while open. `overflow: hidden` alone is not
  // enough on iOS Safari + Chrome Android PWAs — the document itself
  // stays technically scrollable, so the browser's pull-to-refresh
  // gesture still fires when the chat's inner scroll bounces past its
  // top edge. Pinning body to `position: fixed` with the stored scrollY
  // makes the document genuinely unscrollable, which kills PTR at the
  // source. Restore scroll position on close.
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  return (
    <div
      className={`fixed top-14 inset-x-0 bottom-0 z-[55] bg-white transition-transform duration-300 ease-out flex flex-col overscroll-none ${
        isOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
      aria-hidden={!isOpen}
    >
      {/* Collapse bar */}
      <div className="shrink-0 pt-2 pb-1 flex justify-center bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close chat"
          className="w-12 h-1.5 rounded-full bg-gray-300 active:bg-gray-400"
        />
      </div>

      {/* Both surfaces are stacked. Room list stays mounted at all times so
          its rooms and realtime subscriptions are warm whenever the drawer
          opens. Room view is layered above when a room is selected. */}
      <div className="flex-1 min-h-0 relative">
        <div
          className={`absolute inset-0 overflow-y-auto overscroll-contain ${currentRoomId == null ? "" : "hidden"}`}
        >
          {listError ? (
            <div className="p-6 text-center text-sm text-red-600">{listError}</div>
          ) : listData ? (
            <ChatRoomList
              currentUserId={listData.currentUserId}
              users={listData.users}
              onRoomSelect={selectRoom}
            />
          ) : (
            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
          )}
        </div>

        {currentRoomId != null && (
          <div className="absolute inset-0 overflow-y-auto overscroll-contain">
            {roomError ? (
              <div className="p-6 text-center text-sm text-red-600">
                {roomError}
                <button
                  type="button"
                  onClick={backToList}
                  className="block mx-auto mt-3 text-xs text-green-700 underline"
                >
                  Back to chats
                </button>
              </div>
            ) : roomLoading || !roomData || roomData.id !== currentRoomId ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
            ) : (
              <ChatRoom
                roomId={roomData.id}
                roomName={roomData.display_name}
                rawRoomName={roomData.raw_name}
                roomType={roomData.type}
                currentUserId={roomData.current_user_id}
                currentUserName={roomData.current_user_name}
                memberCount={roomData.member_count}
                currentUserRole={roomData.current_user_role}
                createdBy={roomData.created_by}
                members={roomData.members}
                onBack={backToList}
                revealedAt={lastOpenedAt}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
