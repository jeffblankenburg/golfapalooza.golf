import type { Viewport } from "next";

/** Viewport config for read-heavy pages that benefit from pinch-to-zoom
 *  (home, articles, leaderboards). Other pages inherit the locked-down
 *  root layout viewport which disables zoom to avoid accidental pinches
 *  during scoring/interaction. */
export const zoomableViewport: Viewport = {
  themeColor: "#0a5c36",
  width: "device-width",
  initialScale: 1,
  // maximumScale + userScalable intentionally omitted — browser default
  // allows pinch-to-zoom.
};
