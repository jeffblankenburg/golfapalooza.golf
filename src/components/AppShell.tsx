"use client";

import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isVisible } = useMusicPlayer();

  return (
    <div className={`min-h-screen ${isVisible ? "pb-[136px]" : "pb-20"}`}>
      {children}
    </div>
  );
}
