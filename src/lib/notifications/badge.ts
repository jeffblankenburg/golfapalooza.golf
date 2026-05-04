// App-icon badge sync. While the app is open, the page is the source of truth
// for the unread count: it sets the OS badge directly and pushes the same
// number to the service worker so the SW's IndexedDB-backed counter (used by
// the push handler when the app is closed) stays in agreement.

interface BadgingNavigator {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

export async function syncBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const n = Math.max(0, Math.floor(count));

  const nav = navigator as BadgingNavigator;
  try {
    if (n > 0 && nav.setAppBadge) {
      await nav.setAppBadge(n);
    } else if (nav.clearAppBadge) {
      await nav.clearAppBadge();
    }
  } catch {
    // setAppBadge throws on platforms where the app isn't installed — fine.
  }

  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    reg?.active?.postMessage({ type: "badge:set", count: n });
  } catch {
    // SW not registered yet — push handler will reseed on next page load.
  }
}
