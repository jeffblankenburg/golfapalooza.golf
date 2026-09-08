"use client";

import { MusicPlayerProvider } from "@/components/MusicPlayerProvider";
import { ChatDrawerProvider } from "@/contexts/ChatDrawerContext";
import { ChatDrawer } from "@/components/chat/ChatDrawer";

/**
 * The legacy app's shared chrome (music + chat context providers, and the chat
 * drawer surface). Previously mounted globally in the root layout; moved here and
 * scoped to the legacy route groups so the /new (v2) app inherits none of it.
 *
 * `withChat={false}` provides the contexts without the visible drawer — for
 * chrome-less full-screen tools that still contain optional music/chat consumers.
 */
export function LegacyChrome({
  children,
  withChat = true,
}: {
  children: React.ReactNode;
  withChat?: boolean;
}) {
  return (
    <MusicPlayerProvider>
      <ChatDrawerProvider>
        {children}
        {withChat && <ChatDrawer />}
      </ChatDrawerProvider>
    </MusicPlayerProvider>
  );
}
