"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();

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

  // Lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  // The big-screen Calcutta display is a standalone, chrome-free surface — no
  // chat drawer there. (Hooks above still run so ordering stays stable.)
  if (pathname?.startsWith("/calcutta-display")) return null;

  return (
    <>
      {/* Dim backdrop in the gap above the drawer so it's obvious the
          page is still there underneath. Fades with the drawer. */}
      <div
        onClick={closeDrawer}
        aria-hidden="true"
        className={`fixed top-14 inset-x-0 h-8 z-[54] bg-black/40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
    <div
      data-pull-refresh="off"
      className={`fixed top-[calc(3.5rem+2rem)] inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-[55] bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
        isOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
      aria-hidden={!isOpen}
    >
      {/* Collapse bar — grab bar centered, explicit X on the right because
          the bar alone wasn't obvious enough as a close affordance. */}
      <div className="shrink-0 relative pt-3 pb-2 flex justify-center items-center bg-white border-b border-gray-100">
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close chat"
          className="w-12 h-1.5 rounded-full bg-gray-300 active:bg-gray-400"
        />
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close chat"
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Both surfaces are stacked. Room list stays mounted at all times so
          its rooms and realtime subscriptions are warm whenever the drawer
          opens. Room view is layered above when a room is selected. */}
      <div className="flex-1 min-h-0 relative">
        <div
          className={`absolute inset-0 overflow-y-auto ${currentRoomId == null ? "" : "hidden"}`}
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
          <div className="absolute inset-0 overflow-y-auto">
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
    </>
  );
}
