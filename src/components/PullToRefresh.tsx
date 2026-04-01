"use client";

import { useEffect } from "react";

/**
 * Invisible pull-to-refresh for iOS standalone PWA.
 * Uses a sentinel div at the top of the page with IntersectionObserver
 * to detect when the user has pulled past the top, then reloads.
 * Falls back to touch-based detection.
 */
export function PullToRefresh() {
  useEffect(() => {
    let startY = 0;
    let startScrollY = 0;
    let pulling = false;
    const threshold = 80;

    function getScrollTop() {
      return window.pageYOffset || document.documentElement.scrollTop || 0;
    }

    function onTouchStart(e: TouchEvent) {
      // Don't pull-to-refresh when a modal/viewer overlay is open or dragging
      const target = e.target as HTMLElement;
      if (target.closest(".fixed.z-50, .fixed.z-40")) return;
      if (target.closest("[data-drag-item]")) return;

      const scrollTop = getScrollTop();
      if (scrollTop <= 1) {
        startY = e.touches[0].clientY;
        startScrollY = scrollTop;
        pulling = true;
      }
    }

    function onTouchEnd(e: TouchEvent) {
      if (!pulling) return;
      pulling = false;

      const endY = e.changedTouches[0].clientY;
      const dy = endY - startY;
      const scrollTop = getScrollTop();

      // User pulled down while at top and released
      if (dy > threshold && scrollTop <= 1 && startScrollY <= 1) {
        window.location.href = window.location.pathname + "?_t=" + Date.now();
      }
    }

    function onTouchCancel() {
      pulling = false;
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  return null;
}
