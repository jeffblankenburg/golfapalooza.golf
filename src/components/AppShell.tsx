"use client";

import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isVisible, isDrawerExpanded } = useMusicPlayer();

  // Extra bottom padding reserves room for the mini-player strip above
  // the bottom nav. When the drawer is fully expanded it covers the page
  // anyway, so no reservation needed.
  const showMiniStrip = isVisible && !isDrawerExpanded;

  // min-h-dvh (dynamic viewport height) over min-h-screen (100vh): the
  // 100vh value is frozen to iOS Safari's layout viewport, so when its
  // URL bar collapses during scroll the document doesn't grow but the
  // visible area does — and the fixed bottom nav appears to "scroll up"
  // into the page. dvh tracks the visual viewport and keeps the nav
  // pinned to the actual visible bottom.
  return (
    <div className={`min-h-dvh ${showMiniStrip ? "pb-[136px]" : "pb-20"}`}>
      {children}
    </div>
  );
}
