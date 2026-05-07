"use client";

// Thin top-of-page progress bar that fires on every route navigation.
//
// Why: server components can take 100-500ms to render, during which clicking
// a `<Link>` produces no visible feedback. This bar slides in immediately on
// click and disappears once the new route paints, masking the wait.
//
// Implementation:
//   1. Capture clicks at the document level on any same-origin <a> with no
//      modifier keys / target / download attribute (i.e. an in-app nav).
//   2. Show the bar after a 80ms delay so prefetched/cached routes (which
//      complete in <80ms) don't flash.
//   3. Hide the bar when the next paint sees a new pathname or after a
//      safety timeout.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const SHOW_DELAY_MS = 80;
const SAFETY_TIMEOUT_MS = 8000;

export function RouteProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  // Hide whenever the pathname actually changes (the destination painted).
  useEffect(() => {
    setVisible(false);
    setProgress(0);
  }, [pathname]);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;
    let progressTimer: ReturnType<typeof setInterval> | null = null;

    function start() {
      // Reset
      if (showTimer) clearTimeout(showTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      if (progressTimer) clearInterval(progressTimer);

      showTimer = setTimeout(() => {
        setVisible(true);
        setProgress(15);
        // Slowly creep up while we wait. Each tick gets us part of the way
        // toward 90%; we never hit 100 until the route actually swaps.
        progressTimer = setInterval(() => {
          setProgress((p) => (p >= 90 ? p : p + (90 - p) * 0.1));
        }, 200);
      }, SHOW_DELAY_MS);

      safetyTimer = setTimeout(() => {
        setVisible(false);
        setProgress(0);
        if (progressTimer) clearInterval(progressTimer);
      }, SAFETY_TIMEOUT_MS);
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      // Cross-origin → real navigation, browser handles its own UI
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // Same path = no nav, no progress
        if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      } catch {
        return;
      }

      start();
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      if (showTimer) clearTimeout(showTimer);
      if (safetyTimer) clearTimeout(safetyTimer);
      if (progressTimer) clearInterval(progressTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-[2px] bg-green-600 transition-[width] duration-200 ease-out"
      style={{ width: `${progress}%` }}
      aria-hidden="true"
    />
  );
}
