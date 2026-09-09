// App-icon badge sync for v2 (mirrors the legacy badge sync). While the app is
// open, the page is the source of truth: it sets the OS badge directly and pushes
// the same count to the shared service worker so the SW's IndexedDB counter (used
// by the push handler when the app is closed) stays in agreement.

interface BadgingNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export async function syncBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const n = Math.max(0, Math.floor(count));

  const nav = navigator as BadgingNavigator;
  try {
    if (n > 0 && nav.setAppBadge) await nav.setAppBadge(n);
    else if (nav.clearAppBadge) await nav.clearAppBadge();
  } catch {
    // Throws when the app isn't installed — expected, ignore.
  }

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: "badge:set", count: n });
  } catch {
    // SW not registered yet — push handler reseeds on next load.
  }
}
