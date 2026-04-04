"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function logActivity(event_type: string, page_path?: string, metadata?: Record<string, unknown>) {
  // Fire-and-forget — don't block the UI
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type, page_path, metadata }),
  }).catch(() => {
    // Silently ignore failures
  });
}

export function ActivityTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    // Skip duplicate tracking for the same path (e.g. re-renders)
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;

    logActivity("page_view", pathname);
  }, [pathname]);

  return null;
}

/** Call this after a successful login to log the event */
export function logLogin() {
  logActivity("login", "/verify", {
    timestamp: new Date().toISOString(),
  });
}
