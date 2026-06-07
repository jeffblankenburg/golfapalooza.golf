"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ChatDrawerState {
  isOpen: boolean;
  // null = showing the room list; string = showing that specific room.
  // Persisted on close so the next open returns to the same room (matches
  // iMessage-style behavior).
  currentRoomId: string | null;
  // Bumped to Date.now() every time the drawer opens. Consumers (ChatRoom)
  // use this as a re-render trigger to scroll to the newest message every
  // time the user re-enters a conversation — even when the component
  // itself stays mounted between opens.
  lastOpenedAt: number;
}

interface ChatDrawerActions {
  /** Open the drawer. If `roomId` is provided, drill straight into that room. */
  openDrawer: (roomId?: string) => void;
  /** Close the drawer. Keeps `currentRoomId` so the next open returns here. */
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /** From the list, drill into a room. */
  selectRoom: (roomId: string) => void;
  /** From inside a room, go back to the list. */
  backToList: () => void;
}

type ChatDrawerContextType = ChatDrawerState & ChatDrawerActions;

const ChatDrawerContext = createContext<ChatDrawerContextType | null>(null);

export function useChatDrawer() {
  const ctx = useContext(ChatDrawerContext);
  if (!ctx) throw new Error("useChatDrawer must be used within ChatDrawerProvider");
  return ctx;
}

/** Safe variant — returns null when no provider is mounted (e.g., auth pages). */
export function useChatDrawerOptional() {
  return useContext(ChatDrawerContext);
}

export function ChatDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [lastOpenedAt, setLastOpenedAt] = useState(0);
  // Mirror `isOpen` in a ref so toggleDrawer can decide direction without
  // putting side effects inside the setState updater (updater functions
  // must be pure — React calls them during render).
  const isOpenRef = useRef(isOpen);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // Broadcasts every open so other universal drawers (e.g., music) can
  // step aside — they share a z-layer and would otherwise stack invisibly.
  function broadcastOpen() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: "chat" } }));
    }
  }
  const openDrawer = useCallback((roomId?: string) => {
    if (roomId !== undefined) setCurrentRoomId(roomId);
    setIsOpen(true);
    setLastOpenedAt(Date.now());
    broadcastOpen();
  }, []);
  const closeDrawer = useCallback(() => {
    setIsOpen(false);
  }, []);
  const toggleDrawer = useCallback(() => {
    const willOpen = !isOpenRef.current;
    setIsOpen(willOpen);
    if (willOpen) {
      setLastOpenedAt(Date.now());
      broadcastOpen();
    }
  }, []);
  const selectRoom = useCallback((roomId: string) => {
    setCurrentRoomId(roomId);
  }, []);
  const backToList = useCallback(() => {
    setCurrentRoomId(null);
  }, []);

  // Close when another universal drawer announces it's opening.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name && detail.name !== "chat") setIsOpen(false);
    };
    window.addEventListener("ui:drawer-open", handler);
    return () => window.removeEventListener("ui:drawer-open", handler);
  }, []);

  return (
    <ChatDrawerContext.Provider
      value={{
        isOpen,
        currentRoomId,
        lastOpenedAt,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        selectRoom,
        backToList,
      }}
    >
      {children}
    </ChatDrawerContext.Provider>
  );
}
