"use client";

import { MusicPlayerContextProvider } from "@/contexts/MusicPlayerContext";
import { MusicDrawer } from "@/components/music/MusicDrawer";

export function MusicPlayerProvider({ children }: { children: React.ReactNode }) {
  return (
    <MusicPlayerContextProvider>
      {children}
      <MusicDrawer />
    </MusicPlayerContextProvider>
  );
}
