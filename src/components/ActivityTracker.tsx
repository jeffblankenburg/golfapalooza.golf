"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Fire-and-forget activity log. Safe to call from any client component. */
export function logActivity(event_type: string, page_path?: string, metadata?: Record<string, unknown>) {
  fetch("/api/activity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_type, page_path, metadata }),
  }).catch(() => {
    // Silently ignore failures
  });
}

function getDeviceInfo(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  const isStandalone =
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone) ||
    window.matchMedia("(display-mode: standalone)").matches;
  return {
    user_agent: ua,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pwa: isStandalone,
    platform: navigator.platform,
  };
}

export function ActivityTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const deviceInfoRef = useRef<Record<string, unknown> | null>(null);

  useEffect(() => {
    // Capture device info once
    if (!deviceInfoRef.current) {
      deviceInfoRef.current = getDeviceInfo();
    }
  }, []);

  useEffect(() => {
    if (pathname === lastPath.current) return;
    lastPath.current = pathname;

    logActivity("page_view", pathname, deviceInfoRef.current || undefined);
  }, [pathname]);

  // Track global JS errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logActivity("error", window.location.pathname, {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
      });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      logActivity("error", window.location.pathname, {
        message: String(event.reason),
        type: "unhandled_rejection",
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}

/** Call this after a successful login to log the event */
export function logLogin() {
  logActivity("login", "/verify", {
    ...getDeviceInfo(),
    timestamp: new Date().toISOString(),
  });
}
