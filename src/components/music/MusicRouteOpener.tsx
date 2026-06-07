"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMusicPlayer } from "@/contexts/MusicPlayerContext";

/**
 * Renders nothing visible. On mount, opens the music drawer and rewrites
 * the URL to `/` so legacy /music links land the user on Home with the
 * drawer expanded. Music continues playing across the rewrite.
 */
export function MusicRouteOpener() {
  const router = useRouter();
  const { expandDrawer } = useMusicPlayer();

  useEffect(() => {
    expandDrawer();
    router.replace("/");
  }, [expandDrawer, router]);

  return null;
}
