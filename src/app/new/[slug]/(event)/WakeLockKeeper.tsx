"use client";

import { useEffect, useRef } from "react";

/**
 * Holds a Screen Wake Lock for the lifetime of the event shell so phones don't
 * auto-sleep mid-round (which kills audio playback). The browser silently
 * releases the lock whenever the document goes hidden, so we re-acquire on
 * `visibilitychange`. Unsupported browsers / refused requests are a silent no-op.
 * (v2-local copy of the legacy WakeLockKeeper — kept isolated from legacy code.)
 */
export function WakeLockKeeper() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const anyNav = navigator as Navigator & { wakeLock?: WakeLock };
    if (!anyNav.wakeLock) return;

    let cancelled = false;

    async function acquire() {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await anyNav.wakeLock!.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener("release", () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        });
      } catch {
        // Permission denied, page hidden, or unsupported context — silent.
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, []);

  return null;
}
