"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Invisible interval that re-runs the current server component via
 * router.refresh(), so a purely server-rendered page (e.g. Daily Games, whose
 * pot math lives on the server) picks up live changes without a manual reload.
 * Client state is preserved across refreshes. Pauses while the tab is hidden so
 * background tabs don't poll needlessly.
 */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    };
    const interval = setInterval(tick, intervalMs);
    return () => clearInterval(interval);
  }, [router, intervalMs]);

  return null;
}
