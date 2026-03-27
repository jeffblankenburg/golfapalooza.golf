"use client";

import { useEffect } from "react";

/**
 * Invisible pull-to-refresh for iOS PWA and mobile browsers.
 * Detects a downward swipe when at the top of the page
 * and triggers a native reload — no spinners, no UI.
 */
export function PullToRefresh() {
  useEffect(() => {
    let startY = 0;
    let pulling = false;
    const threshold = 150;

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > threshold && window.scrollY === 0) {
        pulling = false;
        window.location.reload();
      }
    }

    function onTouchEnd() {
      pulling = false;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  return null;
}
