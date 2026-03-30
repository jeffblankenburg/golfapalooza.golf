"use client";

import { MusicPlayerContextProvider } from "@/contexts/MusicPlayerContext";
import { MiniPlayer } from "@/components/music/MiniPlayer";

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  return (
    <MusicPlayerContextProvider>
      {children}
      <MiniPlayer />
    </MusicPlayerContextProvider>
  );
}
