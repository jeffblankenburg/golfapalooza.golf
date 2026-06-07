"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChatDrawer } from "@/contexts/ChatDrawerContext";

/**
 * Renders nothing visible. On mount, opens the chat drawer (optionally to a
 * specific room) and rewrites the URL to `/` so legacy /chat or
 * /chat/[roomId] links land the user on Home with the drawer open.
 */
export function ChatRouteOpener({ roomId }: { roomId?: string }) {
  const router = useRouter();
  const { openDrawer } = useChatDrawer();

  useEffect(() => {
    openDrawer(roomId);
    router.replace("/");
  }, [openDrawer, router, roomId]);

  return null;
}
